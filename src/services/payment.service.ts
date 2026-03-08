import prisma from '../config/database';
import { ApiError } from '../middleware';
import { notificationService } from './notification.service';

interface CreateCaissePaymentDto {
    amount: number;
    devisId?: string;
    description?: string;
    paymentDate?: Date;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
}

interface UpdatePaymentDto {
    amount?: number;
    description?: string;
    paymentDate?: Date;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
}

export class PaymentService {
    /**
     * Create a caisse payment (standalone or linked to a devis)
     */
    async createCaissePayment(data: CreateCaissePaymentDto, userId?: string) {
        // If linked to a devis, verify it exists and payment doesn't exceed remaining
        if (data.devisId) {
            const devis = await prisma.devis.findUnique({
                where: { id: data.devisId },
                include: { client: true, payments: true },
            });

            if (!devis) {
                throw new ApiError(404, 'Devis not found');
            }

            const totalPaid = devis.payments.reduce((sum, p) => sum + Number(p.amount), 0);
            const totalAmount = Number(devis.totalAmount);
            const remaining = totalAmount - totalPaid;

            if (data.amount > remaining) {
                throw new ApiError(400, `Le montant dépasse le reste à payer (${remaining.toFixed(3)} TND)`);
            }

            if (data.amount <= 0) {
                throw new ApiError(400, 'Le montant doit être supérieur à 0');
            }
        }

        const payment = await prisma.payment.create({
            data: {
                amount: data.amount,
                description: data.description,
                devisId: data.devisId || null,
                paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                paymentMethod: data.paymentMethod,
                reference: data.reference,
                notes: data.notes,
                createdById: userId,
            },
            include: {
                devis: {
                    include: { client: { select: { name: true } } },
                },
                createdBy: {
                    select: { firstName: true, lastName: true },
                },
            },
        });

        // Create notification
        const clientName = payment.devis?.client?.name;
        await notificationService.create({
            type: 'PAYMENT_RECEIVED',
            title: 'Paiement reçu',
            message: `Paiement de ${Number(payment.amount).toFixed(2)} TND reçu${clientName ? ` pour ${clientName}` : ''}`,
            entityType: 'payment',
            entityId: payment.id,
            triggeredById: userId,
        });

        return payment;
    }

    /**
     * Legacy: Create payment linked to an invoice (kept for backward compat)
     */
    async createPayment(invoiceId: string, data: CreateCaissePaymentDto, userId?: string) {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                payments: true,
            },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        const totalPaid = invoice.payments.reduce(
            (sum, p) => sum + Number(p.amount),
            0
        );
        const totalAmount = Number(invoice.totalAmount);
        const remaining = totalAmount - totalPaid;

        if (data.amount > remaining) {
            throw new ApiError(
                400,
                `Payment amount (${data.amount}) exceeds remaining balance (${remaining})`
            );
        }

        const payment = await prisma.payment.create({
            data: {
                invoiceId,
                amount: data.amount,
                paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                paymentMethod: data.paymentMethod,
                reference: data.reference,
                notes: data.notes,
                createdById: userId,
            },
        });

        await notificationService.create({
            type: 'PAYMENT_RECEIVED',
            title: 'Paiement reçu',
            message: `Paiement de ${Number(payment.amount).toFixed(2)} TND reçu pour la facture ${invoice.reference}`,
            entityType: 'payment',
            entityId: payment.id,
        });

        return payment;
    }

    /**
     * Create a payment for a client, auto-distributed across unpaid devis (oldest first)
     */
    async createClientPayment(clientId: string, data: CreateCaissePaymentDto, userId?: string) {
        if (!data.amount || data.amount <= 0) {
            throw new ApiError(400, 'Le montant doit être supérieur à 0');
        }

        // Get client
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        // Get all unpaid devis for this client (VALIDATED or INVOICED, not fully paid), oldest first
        const devisList = await prisma.devis.findMany({
            where: {
                clientId,
                status: { in: ['VALIDATED', 'INVOICED'] },
            },
            include: { payments: true },
            orderBy: { createdAt: 'asc' },
        });

        // Filter to only those with remaining balance
        const unpaidDevis = devisList
            .map(d => {
                const totalPaid = d.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                const remaining = Number(d.totalAmount) - totalPaid;
                return { ...d, remaining };
            })
            .filter(d => d.remaining > 0);

        let remainingAmount = data.amount;

        // Check total outstanding
        const totalOutstanding = unpaidDevis.reduce((sum, d) => sum + d.remaining, 0);
        if (data.amount > totalOutstanding) {
            throw new ApiError(400, `Le montant (${data.amount.toFixed(3)}) dépasse le solde restant (${totalOutstanding.toFixed(3)} TND)`);
        }

        const createdPayments = [];

        // Distribute across devis, oldest first
        for (const devis of unpaidDevis) {
            if (remainingAmount <= 0) break;

            const payAmount = Math.min(remainingAmount, devis.remaining);
            remainingAmount = Math.round((remainingAmount - payAmount) * 1000) / 1000;

            const payment = await prisma.payment.create({
                data: {
                    amount: payAmount,
                    description: data.description || `Paiement client ${client.name}`,
                    devisId: devis.id,
                    paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                    paymentMethod: data.paymentMethod,
                    reference: data.reference,
                    notes: data.notes,
                    createdById: userId,
                },
                include: {
                    devis: { include: { client: { select: { name: true } } } },
                    createdBy: { select: { firstName: true, lastName: true } },
                },
            });

            createdPayments.push(payment);
        }

        // Create notification
        await notificationService.create({
            type: 'PAYMENT_RECEIVED',
            title: 'Paiement reçu',
            message: `Paiement de ${Number(data.amount).toFixed(3)} TND reçu pour ${client.name} (réparti sur ${createdPayments.length} devis)`,
            entityType: 'payment',
            entityId: createdPayments[0]?.id,
            triggeredById: userId,
        });

        return createdPayments;
    }

    async getPaymentsByDevis(devisId: string) {
        return prisma.payment.findMany({
            where: { devisId },
            orderBy: { paymentDate: 'desc' },
            include: {
                createdBy: {
                    select: { firstName: true, lastName: true },
                },
            },
        });
    }

    async getPaymentsByInvoice(invoiceId: string) {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        return prisma.payment.findMany({
            where: { invoiceId },
            orderBy: { paymentDate: 'desc' },
        });
    }

    async getPaymentById(paymentId: string) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                devis: {
                    include: {
                        client: true,
                    },
                },
                invoice: {
                    include: {
                        client: true,
                    },
                },
                createdBy: {
                    select: { firstName: true, lastName: true },
                },
            },
        });

        if (!payment) {
            throw new ApiError(404, 'Payment not found');
        }

        return payment;
    }

    async updatePayment(paymentId: string, data: UpdatePaymentDto) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
        });

        if (!payment) {
            throw new ApiError(404, 'Payment not found');
        }

        return prisma.payment.update({
            where: { id: paymentId },
            data: {
                amount: data.amount,
                description: data.description,
                paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
                paymentMethod: data.paymentMethod,
                reference: data.reference,
                notes: data.notes,
            },
        });
    }

    async deletePayment(paymentId: string) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
        });

        if (!payment) {
            throw new ApiError(404, 'Payment not found');
        }

        await prisma.payment.delete({
            where: { id: paymentId },
        });

        return { success: true, message: 'Payment deleted successfully' };
    }

    async getPaymentStats(invoiceId: string) {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                payments: true,
            },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        const totalAmount = Number(invoice.totalAmount);
        const totalPaid = invoice.payments.reduce(
            (sum, p) => sum + Number(p.amount),
            0
        );
        const remaining = totalAmount - totalPaid;
        const percentPaid = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;

        return {
            invoiceId: invoice.id,
            invoiceReference: invoice.reference,
            totalAmount,
            totalPaid,
            remaining,
            percentPaid: Math.round(percentPaid * 100) / 100,
            paymentCount: invoice.payments.length,
            isPaid: remaining === 0 && totalAmount > 0,
        };
    }
}

export const paymentService = new PaymentService();

import prisma from '../config/database';
import { ApiError } from '../middleware';

interface CreatePaymentDto {
    amount: number;
    paymentDate?: Date;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
}

interface UpdatePaymentDto {
    amount?: number;
    paymentDate?: Date;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
}

export class PaymentService {
    async createPayment(invoiceId: string, data: CreatePaymentDto) {
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                devis: true,
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
        // Use invoice.totalAmount directly (works for both devis-based and direct invoices)
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
            },
        });

        return payment;
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
                invoice: {
                    include: {
                        devis: {
                            include: {
                                client: true,
                            },
                        },
                    },
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
            include: {
                invoice: {
                    include: {
                        devis: true,
                        payments: true,
                    },
                },
            },
        });

        if (!payment) {
            throw new ApiError(404, 'Payment not found');
        }

        if (data.amount !== undefined) {
            const otherPayments = payment.invoice.payments.filter(
                (p) => p.id !== paymentId
            );
            const totalOtherPayments = otherPayments.reduce(
                (sum, p) => sum + Number(p.amount),
                0
            );
            // Use invoice.totalAmount directly (works for both devis-based and direct invoices)
            const totalAmount = Number(payment.invoice.totalAmount);
            const maxAllowed = totalAmount - totalOtherPayments;

            if (data.amount > maxAllowed) {
                throw new ApiError(
                    400,
                    `Payment amount (${data.amount}) exceeds maximum allowed (${maxAllowed})`
                );
            }
        }

        return prisma.payment.update({
            where: { id: paymentId },
            data: {
                amount: data.amount,
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
                devis: true,
                payments: true,
            },
        });

        if (!invoice) {
            throw new ApiError(404, 'Invoice not found');
        }

        // Use invoice.totalAmount directly (works for both devis-based and direct invoices)
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

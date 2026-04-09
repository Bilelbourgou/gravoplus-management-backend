import prisma from '../config/database';
import { CreateClientDto } from '../types';
import { ApiError } from '../middleware';
import { notificationService } from './notification.service';

export class ClientService {
    /**
     * Get all clients
     */
    async getAllClients() {
        return prisma.client.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { devis: true },
                },
            },
        });
    }

    /**
     * Get client by ID with devis history
     */
    async getClientById(clientId: string) {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                devis: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        createdBy: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                },
            },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        return client;
    }

    /**
     * Create new client
     */
    async createClient(data: CreateClientDto, triggeredById?: string) {
        const client = await prisma.client.create({
            data,
        });

        // Create notification
        await notificationService.create({
            type: 'CLIENT_CREATED',
            title: 'Nouveau client',
            message: `Le client "${client.name}" a été créé`,
            entityType: 'client',
            entityId: client.id,
            triggeredById,
        });

        return client;
    }

    /**
     * Update client
     */
    async updateClient(clientId: string, data: Partial<CreateClientDto>) {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        return prisma.client.update({
            where: { id: clientId },
            data,
        });
    }

    /**
     * Delete client
     */
    async deleteClient(clientId: string, force: boolean = false) {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                _count: {
                    select: { devis: true },
                },
            },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        if (client._count.devis > 0 && !force) {
            throw new ApiError(400, 'Cannot delete client with existing quotes');
        }

        await prisma.client.delete({
            where: { id: clientId },
        });

        return { message: 'Client deleted successfully' };
    }

    /**
     * Search clients
     */
    async searchClients(query: string) {
        return prisma.client.findMany({
            where: {
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { phone: { contains: query, mode: 'insensitive' } },
                    { email: { contains: query, mode: 'insensitive' } },
                ],
            },
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Get client balance with detailed financial information (devis-centric flow)
     */
    async getClientBalance(clientId: string) {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                devis: {
                    where: {
                        status: { in: ['VALIDATED', 'INVOICED', 'DRAFT'] },
                    },
                    orderBy: { createdAt: 'desc' },
                    include: {
                        payments: {
                            orderBy: { paymentDate: 'desc' },
                            include: {
                                createdBy: {
                                    select: { firstName: true, lastName: true },
                                },
                            },
                        },
                        invoice: {
                            select: { id: true, reference: true, createdAt: true },
                        },
                        createdBy: {
                            select: { firstName: true, lastName: true, role: true },
                        },
                        lines: {
                            include: { material: { select: { name: true } } },
                        },
                        services: {
                            include: { service: { select: { name: true, price: true } } },
                        },
                    },
                },
            },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        let totalDevisAmount = 0;
        let totalPaid = 0;
        let payableDevisAmount = 0;
        let payablePaid = 0;

        const devisWithBalance = client.devis.map((devis) => {
            const devisTotal = Number(devis.totalAmount);
            const paidAmount = devis.payments.reduce(
                (sum, p) => sum + Number(p.amount), 0
            );
            const remaining = devisTotal - paidAmount;

            totalDevisAmount += devisTotal;
            totalPaid += paidAmount;

            // Only VALIDATED and INVOICED devis count toward payable outstanding
            if (devis.status === 'VALIDATED' || devis.status === 'INVOICED') {
                payableDevisAmount += devisTotal;
                payablePaid += paidAmount;
            }

            return {
                id: devis.id,
                reference: devis.reference,
                status: devis.status,
                totalAmount: devisTotal,
                paidAmount,
                remaining,
                isFullyPaid: remaining <= 0,
                createdAt: devis.createdAt,
                createdBy: devis.createdBy,
                invoice: devis.invoice,
                lines: devis.lines.map(l => ({
                    id: l.id,
                    machineType: l.machineType,
                    description: l.description,
                    lineTotal: Number(l.lineTotal),
                    material: l.material,
                })),
                services: devis.services.map(s => ({
                    id: s.id,
                    price: Number(s.price),
                    service: s.service,
                })),
                payments: devis.payments.map((p) => ({
                    id: p.id,
                    amount: Number(p.amount),
                    paymentDate: p.paymentDate,
                    paymentMethod: p.paymentMethod,
                    reference: p.reference,
                    notes: p.notes,
                    createdBy: p.createdBy,
                })),
            };
        });

        return {
            summary: {
                totalDevisAmount,
                totalPaid,
                outstandingBalance: payableDevisAmount - payablePaid,
                devisCount: devisWithBalance.length,
                fullyPaidCount: devisWithBalance.filter(d => d.isFullyPaid).length,
                pendingPaymentCount: devisWithBalance.filter(d => !d.isFullyPaid && d.status === 'VALIDATED').length,
            },
            devis: devisWithBalance,
        };
    }

}

export const clientService = new ClientService();

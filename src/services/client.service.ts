import prisma from '../config/database';
import { CreateClientDto } from '../types';
import { ApiError } from '../middleware';

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
    async createClient(data: CreateClientDto) {
        return prisma.client.create({
            data,
        });
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
    async deleteClient(clientId: string) {
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

        if (client._count.devis > 0) {
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
     * Get client balance with detailed financial information
     */
    async getClientBalance(clientId: string) {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                invoices: {
                    include: {
                        payments: {
                            orderBy: { paymentDate: 'desc' },
                        },
                        items: true,
                        devis: {
                            select: {
                                id: true,
                                reference: true,
                                totalAmount: true,
                                status: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                devis: {
                    where: {
                        status: {
                            in: ['VALIDATED', 'DRAFT'],
                        },
                        invoiceId: null,
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        let totalInvoiced = 0;
        let totalPaid = 0;

        console.log('\n=== CLIENT BALANCE DEBUG ===');
        console.log('Client:', client.name, '(', client.id, ')');
        console.log('Total invoices:', client.invoices.length);

        const invoicesWithBalance = client.invoices.map((invoice) => {
            const invoiceTotal = Number(invoice.totalAmount);
            const paidAmount = invoice.payments.reduce(
                (sum, payment) => sum + Number(payment.amount),
                0
            );
            const balance = invoiceTotal - paidAmount;

            console.log('\nInvoice:', invoice.reference);
            console.log('  - Raw totalAmount:', invoice.totalAmount, '(type:', typeof invoice.totalAmount, ')');
            console.log('  - Converted invoiceTotal:', invoiceTotal);
            console.log('  - Payments count:', invoice.payments.length);
            if (invoice.payments.length > 0) {
                console.log('  - Payment details:', invoice.payments.map(p => ({
                    amount: Number(p.amount),
                    date: p.paymentDate
                })));
            }
            console.log('  - Items count:', invoice.items?.length || 0);
            console.log('  - Devis count:', invoice.devis?.length || 0);
            console.log('  - Paid amount:', paidAmount);
            console.log('  - Balance:', balance);
            console.log('  - Return object:', JSON.stringify({
                reference: invoice.reference,
                totalAmount: invoiceTotal,
                paidAmount,
                balance
            }));

            totalInvoiced += invoiceTotal;
            totalPaid += paidAmount;

            return {
                id: invoice.id,
                reference: invoice.reference,
                totalAmount: invoiceTotal,
                paidAmount,
                balance,
                createdAt: invoice.createdAt,
                devisCount: invoice.devis.length,
                payments: invoice.payments.map((p) => ({
                    id: p.id,
                    amount: Number(p.amount),
                    paymentDate: p.paymentDate,
                    paymentMethod: p.paymentMethod,
                    reference: p.reference,
                    notes: p.notes,
                })),
            };
        });

        const pendingDevis = client.devis.map((devis) => ({
            id: devis.id,
            reference: devis.reference,
            status: devis.status,
            totalAmount: Number(devis.totalAmount),
            createdAt: devis.createdAt,
        }));

        const result = {
            summary: {
                totalInvoiced,
                totalPaid,
                outstandingBalance: totalInvoiced - totalPaid,
                pendingDevisTotal: pendingDevis.reduce((sum, d) => sum + d.totalAmount, 0),
            },
            invoices: invoicesWithBalance,
            pendingDevis,
        };

        console.log('\n=== FINAL BALANCE SUMMARY ===');
        console.log('Total Invoiced:', totalInvoiced);
        console.log('Total Paid:', totalPaid);
        console.log('Outstanding Balance:', totalInvoiced - totalPaid);
        console.log('Number of invoices:', invoicesWithBalance.length);
        console.log('================================\n');

        return result;
    }

}

export const clientService = new ClientService();

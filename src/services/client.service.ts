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
}

export const clientService = new ClientService();

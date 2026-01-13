
import prisma from '../config/database';
import { CreateDevisDto, AddDevisLineDto, AddDevisServiceDto, DevisStatus, UserRole } from '../types';
import { ApiError } from '../middleware';
import { calculationService } from './calculation.service';

export class DevisService {
    /**
     * Generate unique devis reference
     */
    private async generateReference(): Promise<string> {
        const year = new Date().getFullYear();
        const count = await prisma.devis.count({
            where: {
                reference: {
                    startsWith: `DEV-${year}`,
                },
            },
        });

        const number = (count + 1).toString().padStart(4, '0');
        return `DEV-${year}-${number}`;
    }

    /**
     * Get all devis (filtered by role)
     */
    async getAllDevis(userId: string, role: UserRole, filters?: {
        clientId?: string;
        status?: DevisStatus;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const where: Record<string, unknown> = {};

        // Employees can only see their own devis
        if (role === UserRole.EMPLOYEE) {
            where.createdById = userId;
        }

        if (filters?.clientId) {
            where.clientId = filters.clientId;
        }

        if (filters?.status) {
            where.status = filters.status;
        }

        if (filters?.dateFrom || filters?.dateTo) {
            where.createdAt = {};
            if (filters?.dateFrom) {
                (where.createdAt as Record<string, Date>).gte = filters.dateFrom;
            }
            if (filters?.dateTo) {
                (where.createdAt as Record<string, Date>).lte = filters.dateTo;
            }
        }

        return prisma.devis.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                client: {
                    select: { id: true, name: true, phone: true },
                },
                createdBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
                invoice: true,
                _count: {
                    select: { lines: true, services: true },
                },
            },
        });
    }

    /**
     * Get devis by ID with full details
     */
    async getDevisById(devisId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: {
                client: true,
                createdBy: {
                    select: { id: true, firstName: true, lastName: true, username: true },
                },
                lines: {
                    include: {
                        material: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
                services: {
                    include: { service: true },
                },
                invoice: true,
            },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        return devis;
    }

    /**
     * Create new devis
     */
    async createDevis(userId: string, data: CreateDevisDto) {
        // Verify client exists
        const client = await prisma.client.findUnique({
            where: { id: data.clientId },
        });

        if (!client) {
            throw new ApiError(404, 'Client not found');
        }

        const reference = await this.generateReference();

        return prisma.devis.create({
            data: {
                reference,
                clientId: data.clientId,
                createdById: userId,
                notes: data.notes,
            },
            include: {
                client: true,
                createdBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
    }

    /**
     * Add line to devis
     */
    async addLine(devisId: string, userId: string, role: UserRole, data: AddDevisLineDto) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        // Check if employee is authorized to use this machine
        if (role === UserRole.EMPLOYEE) {
            const authorized = await prisma.userMachine.findFirst({
                where: {
                    userId,
                    machine: data.machineType,
                },
            });

            if (!authorized) {
                throw new ApiError(403, 'You are not authorized to use this machine');
            }
        }

        // Calculate line
        const calculation = await calculationService.calculateLine({
            machineType: data.machineType,
            minutes: data.minutes,
            meters: data.meters,
            quantity: data.quantity,
            materialId: data.materialId,
        });

        const line = await prisma.devisLine.create({
            data: {
                devisId,
                machineType: data.machineType,
                description: data.description,
                minutes: data.minutes ?? null,
                meters: data.meters ?? null,
                quantity: data.quantity,
                unitPrice: calculation.unitPrice,
                materialCost: calculation.materialCost,
                lineTotal: calculation.lineTotal,
                materialId: data.materialId,
            },
            include: {
                material: true,
            },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return {
            line,
            calculation,
        };
    }

    /**
     * Remove line from devis
     */
    async removeLine(devisId: string, lineId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        await prisma.devisLine.delete({
            where: { id: lineId, devisId },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return { message: 'Line removed successfully' };
    }

    /**
     * Add fixed service to devis
     */
    async addService(devisId: string, data: AddDevisServiceDto) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        // Get service price
        const service = await prisma.fixedService.findUnique({
            where: { id: data.serviceId },
        });

        if (!service || !service.isActive) {
            throw new ApiError(404, 'Service not found');
        }

        // Check if service already added
        const existing = await prisma.devisService.findFirst({
            where: { devisId, serviceId: data.serviceId },
        });

        if (existing) {
            throw new ApiError(400, 'Service already added to this devis');
        }

        const devisService = await prisma.devisService.create({
            data: {
                devisId,
                serviceId: data.serviceId,
                price: service.price,
            },
            include: { service: true },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return devisService;
    }

    /**
     * Remove service from devis
     */
    async removeService(devisId: string, devisServiceId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Cannot modify a non-draft devis');
        }

        await prisma.devisService.delete({
            where: { id: devisServiceId, devisId },
        });

        // Recalculate devis total
        await calculationService.calculateDevisTotal(devisId);

        return { message: 'Service removed successfully' };
    }

    /**
     * Validate devis (Admin only)
     */
    async validateDevis(devisId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
            include: { lines: true },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status !== DevisStatus.DRAFT) {
            throw new ApiError(400, 'Devis is not in draft status');
        }

        if (devis.lines.length === 0) {
            throw new ApiError(400, 'Cannot validate an empty devis');
        }

        return prisma.devis.update({
            where: { id: devisId },
            data: {
                status: DevisStatus.VALIDATED,
                validatedAt: new Date(),
            },
        });
    }

    /**
     * Cancel devis (Admin only)
     */
    async cancelDevis(devisId: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        if (devis.status === DevisStatus.INVOICED) {
            throw new ApiError(400, 'Cannot cancel an invoiced devis');
        }

        return prisma.devis.update({
            where: { id: devisId },
            data: { status: DevisStatus.CANCELLED },
        });
    }

    /**
     * Update devis notes
     */
    async updateNotes(devisId: string, notes: string) {
        const devis = await prisma.devis.findUnique({
            where: { id: devisId },
        });

        if (!devis) {
            throw new ApiError(404, 'Devis not found');
        }

        return prisma.devis.update({
            where: { id: devisId },
            data: { notes },
        });
    }
}

export const devisService = new DevisService();

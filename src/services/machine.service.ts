import prisma from '../config/database';
import { MachineType } from '../types';
import { ApiError } from '../middleware';

export class MachineService {
    /**
     * Get all machine pricing
     */
    async getAllPricing() {
        return prisma.machinePricing.findMany({
            orderBy: { machineType: 'asc' },
        });
    }

    /**
     * Update pricing for a machine type
     */
    async updatePricing(machineType: MachineType, pricePerUnit: number, description?: string) {
        return prisma.machinePricing.upsert({
            where: { machineType },
            update: {
                pricePerUnit,
                description,
            },
            create: {
                machineType,
                pricePerUnit,
                description,
            },
        });
    }

    /**
     * Get machines authorized for a user
     */
    async getAuthorizedMachines(userId: string) {
        const userMachines = await prisma.userMachine.findMany({
            where: { userId },
        });

        return userMachines.map((um) => um.machine);
    }

    /**
     * Initialize default pricing if not exists
     */
    async initializeDefaultPricing() {
        const defaults = [
            { machineType: MachineType.CNC, pricePerUnit: 1.5, description: 'Prix par minute' },
            { machineType: MachineType.LASER, pricePerUnit: 2.0, description: 'Prix par minute' },
            { machineType: MachineType.CHAMPS, pricePerUnit: 5.0, description: 'Prix par mètre' },
            { machineType: MachineType.PANNEAUX, pricePerUnit: 25.0, description: 'Prix par unité' },
            { machineType: MachineType.SERVICE_MAINTENANCE, pricePerUnit: 50.0, description: 'Prix forfaitaire' },
            { machineType: MachineType.PLIAGE, pricePerUnit: 3.0, description: 'Prix par mètre' },
        ];

        for (const pricing of defaults) {
            await prisma.machinePricing.upsert({
                where: { machineType: pricing.machineType },
                update: {},
                create: {
                    machineType: pricing.machineType,
                    pricePerUnit: pricing.pricePerUnit,
                    description: pricing.description,
                },
            });
        }
    }
}

export const machineService = new MachineService();

// Fixed Services
export class FixedServicesService {
    async getAll() {
        return prisma.fixedService.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });
    }

    async create(name: string, price: number, description?: string) {
        return prisma.fixedService.create({
            data: {
                name,
                price,
                description,
            },
        });
    }

    async update(id: string, data: { name?: string; price?: number; description?: string }) {
        const service = await prisma.fixedService.findUnique({ where: { id } });

        if (!service) {
            throw new ApiError(404, 'Service not found');
        }

        return prisma.fixedService.update({
            where: { id },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.price !== undefined && { price: data.price }),
                ...(data.description !== undefined && { description: data.description }),
            },
        });
    }

    async deactivate(id: string) {
        const service = await prisma.fixedService.findUnique({ where: { id } });

        if (!service) {
            throw new ApiError(404, 'Service not found');
        }

        return prisma.fixedService.update({
            where: { id },
            data: { isActive: false },
        });
    }
}

export const fixedServicesService = new FixedServicesService();

// Materials
export class MaterialService {
    async getAll() {
        return prisma.material.findMany({
            where: { isActive: true },
            include: { category: true },
            orderBy: { name: 'asc' },
        });
    }

    async create(name: string, pricePerUnit: number, unit: string, description?: string, categoryId?: string) {
        return prisma.material.create({
            data: {
                name,
                pricePerUnit,
                unit,
                description,
                categoryId,
            },
        });
    }

    async update(id: string, data: { name?: string; pricePerUnit?: number; unit?: string; description?: string; categoryId?: string; isActive?: boolean }) {
        const material = await prisma.material.findUnique({ where: { id } });

        if (!material) {
            throw new ApiError(404, 'Material not found');
        }

        return prisma.material.update({
            where: { id },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.pricePerUnit !== undefined && { pricePerUnit: data.pricePerUnit }),
                ...(data.unit && { unit: data.unit }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    }

    async deactivate(id: string) {
        const material = await prisma.material.findUnique({ where: { id } });

        if (!material) {
            throw new ApiError(404, 'Material not found');
        }

        return prisma.material.update({
            where: { id },
            data: { isActive: false },
        });
    }
}

export const materialService = new MaterialService();

// Maintenance Materials
export class MaintenanceMaterialService {
    async getAll() {
        return prisma.maintenanceMaterial.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });
    }

    async create(name: string, pricePerUnit: number, unit: string, description?: string) {
        return prisma.maintenanceMaterial.create({
            data: {
                name,
                pricePerUnit,
                unit,
                description,
            },
        });
    }

    async update(id: string, data: { name?: string; pricePerUnit?: number; unit?: string; description?: string }) {
        const material = await prisma.maintenanceMaterial.findUnique({ where: { id } });

        if (!material) {
            throw new ApiError(404, 'Maintenance material not found');
        }

        return prisma.maintenanceMaterial.update({
            where: { id },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.pricePerUnit !== undefined && { pricePerUnit: data.pricePerUnit }),
                ...(data.unit && { unit: data.unit }),
                ...(data.description !== undefined && { description: data.description }),
            },
        });
    }

    async deactivate(id: string) {
        const material = await prisma.maintenanceMaterial.findUnique({ where: { id } });

        if (!material) {
            throw new ApiError(404, 'Maintenance material not found');
        }

        return prisma.maintenanceMaterial.update({
            where: { id },
            data: { isActive: false },
        });
    }
}

export const maintenanceMaterialService = new MaintenanceMaterialService();

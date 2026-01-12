import { Request, Response, NextFunction } from 'express';
import { machineService, fixedServicesService, materialService } from '../services';
import { MachineType } from '../types';

export class MachineController {
    async getAllPricing(_req: Request, res: Response, next: NextFunction) {
        try {
            const pricing = await machineService.getAllPricing();

            res.json({
                success: true,
                data: pricing,
            });
        } catch (error) {
            next(error);
        }
    }

    async updatePricing(req: Request, res: Response, next: NextFunction) {
        try {
            const { type } = req.params;
            const { pricePerUnit, description } = req.body;

            if (pricePerUnit === undefined || pricePerUnit < 0) {
                res.status(400).json({
                    success: false,
                    error: 'Valid price per unit is required',
                });
                return;
            }

            const pricing = await machineService.updatePricing(
                type as MachineType,
                pricePerUnit,
                description
            );

            res.json({
                success: true,
                data: pricing,
            });
        } catch (error) {
            next(error);
        }
    }

    async getAuthorizedMachines(req: Request, res: Response, next: NextFunction) {
        try {
            const machines = await machineService.getAuthorizedMachines(req.user!.id);

            res.json({
                success: true,
                data: machines,
            });
        } catch (error) {
            next(error);
        }
    }
}

export class FixedServiceController {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const services = await fixedServicesService.getAll();

            res.json({
                success: true,
                data: services,
            });
        } catch (error) {
            next(error);
        }
    }

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, price, description } = req.body;

            if (!name || price === undefined) {
                res.status(400).json({
                    success: false,
                    error: 'Name and price are required',
                });
                return;
            }

            const service = await fixedServicesService.create(name, price, description);

            res.status(201).json({
                success: true,
                data: service,
            });
        } catch (error) {
            next(error);
        }
    }

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { name, price, description } = req.body;

            const service = await fixedServicesService.update(id as string, { name, price, description });

            res.json({
                success: true,
                data: service,
            });
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            await fixedServicesService.deactivate(id as string);

            res.json({
                success: true,
                data: { message: 'Service deactivated successfully' },
            });
        } catch (error) {
            next(error);
        }
    }
}

export class MaterialController {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const materials = await materialService.getAll();

            res.json({
                success: true,
                data: materials,
            });
        } catch (error) {
            next(error);
        }
    }

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, pricePerUnit, unit, description } = req.body;

            if (!name || pricePerUnit === undefined || !unit) {
                res.status(400).json({
                    success: false,
                    error: 'Name, price per unit, and unit are required',
                });
                return;
            }

            const material = await materialService.create(name, pricePerUnit, unit, description);

            res.status(201).json({
                success: true,
                data: material,
            });
        } catch (error) {
            next(error);
        }
    }

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { name, pricePerUnit, unit, description } = req.body;

            const material = await materialService.update(id as string, { name, pricePerUnit, unit, description });

            res.json({
                success: true,
                data: material,
            });
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            await materialService.deactivate(id as string);

            res.json({
                success: true,
                data: { message: 'Material deactivated successfully' },
            });
        } catch (error) {
            next(error);
        }
    }
}

export const machineController = new MachineController();
export const fixedServiceController = new FixedServiceController();
export const materialController = new MaterialController();

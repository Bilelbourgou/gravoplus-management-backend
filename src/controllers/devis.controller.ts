import { Request, Response, NextFunction } from 'express';
import { devisService, calculationService } from '../services';
import { DevisStatus, UserRole } from '../types';

export class DevisController {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { clientId, status, dateFrom, dateTo } = req.query;

            const devisList = await devisService.getAllDevis(
                req.user!.id,
                req.user!.role as UserRole,
                {
                    clientId: clientId as string,
                    status: status as DevisStatus,
                    dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
                    dateTo: dateTo ? new Date(dateTo as string) : undefined,
                }
            );

            res.json({
                success: true,
                data: devisList,
            });
        } catch (error) {
            next(error);
        }
    }

    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const devis = await devisService.getDevisById(id as string);

            res.json({
                success: true,
                data: devis,
            });
        } catch (error) {
            next(error);
        }
    }

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const { clientId, notes } = req.body;

            if (!clientId) {
                res.status(400).json({
                    success: false,
                    error: 'Client ID is required',
                });
                return;
            }

            const devis = await devisService.createDevis(req.user!.id, {
                clientId,
                notes,
            });

            res.status(201).json({
                success: true,
                data: devis,
            });
        } catch (error) {
            next(error);
        }
    }

    async addLine(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { machineType, description, minutes, meters, quantity, materialId } = req.body;

            if (!machineType) {
                res.status(400).json({
                    success: false,
                    error: 'Machine type is required',
                });
                return;
            }

            const result = await devisService.addLine(
                id as string,
                req.user!.id,
                req.user!.role as UserRole,
                {
                    machineType,
                    description,
                    minutes,
                    meters,
                    quantity,
                    materialId,
                }
            );

            res.status(201).json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async removeLine(req: Request, res: Response, next: NextFunction) {
        try {
            const { id, lineId } = req.params;

            const result = await devisService.removeLine(id as string, lineId as string);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async addService(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { serviceId } = req.body;

            if (!serviceId) {
                res.status(400).json({
                    success: false,
                    error: 'Service ID is required',
                });
                return;
            }

            const result = await devisService.addService(id as string, { serviceId });

            res.status(201).json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async removeService(req: Request, res: Response, next: NextFunction) {
        try {
            const { id, serviceId } = req.params;

            const result = await devisService.removeService(id as string, serviceId as string);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async calculate(req: Request, res: Response, next: NextFunction) {
        try {
            const { machineType, minutes, meters, quantity, materialId } = req.body;

            if (!machineType) {
                res.status(400).json({
                    success: false,
                    error: 'Machine type is required',
                });
                return;
            }

            const result = await calculationService.calculateLine({
                machineType,
                minutes,
                meters,
                quantity,
                materialId,
            });

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async validate(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const devis = await devisService.validateDevis(id as string);

            res.json({
                success: true,
                data: devis,
            });
        } catch (error) {
            next(error);
        }
    }

    async cancel(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const devis = await devisService.cancelDevis(id as string);

            res.json({
                success: true,
                data: devis,
            });
        } catch (error) {
            next(error);
        }
    }

    async updateNotes(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { notes } = req.body;

            const devis = await devisService.updateNotes(id as string, notes);

            res.json({
                success: true,
                data: devis,
            });
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const result = await devisService.deleteDevis(id as string);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const devisController = new DevisController();

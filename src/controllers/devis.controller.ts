import { Request, Response, NextFunction } from 'express';
import { devisService, calculationService } from '../services';
import { DevisStatus, DevisType, UserRole } from '../types';

export class DevisController {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { clientId, status, type, dateFrom, dateTo } = req.query;

            const devisList = await devisService.getAllDevis(
                req.user!.id,
                req.user!.role as UserRole,
                {
                    clientId: clientId as string,
                    status: status as DevisStatus,
                    type: type as DevisType,
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
            const { machineType, description, minutes, meters, quantity, materialId, unitPrice, width, height, dimensionUnit } = req.body;

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
                    unitPrice,
                    width,
                    height,
                    dimensionUnit,
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
            const { machineType, minutes, meters, quantity, materialId, width, height, dimensionUnit } = req.body;

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
                width,
                height,
                dimensionUnit,
            });

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async updateAcompte(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { acompte } = req.body;

            if (acompte === undefined || acompte === null) {
                res.status(400).json({ success: false, error: 'Acompte amount is required' });
                return;
            }

            const devis = await devisService.updateAcompte(id as string, Number(acompte));

            res.json({ success: true, data: devis });
        } catch (error) {
            next(error);
        }
    }

    async updateRemise(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { remise, remiseType } = req.body;

            if (remise === undefined || !remiseType) {
                res.status(400).json({ success: false, error: 'Remise amount and type are required' });
                return;
            }

            const total = await devisService.updateRemise(id as string, Number(remise), remiseType);

            res.json({ success: true, data: { totalAmount: total } });
        } catch (error) {
            next(error);
        }
    }

    async updateTimbreFiscal(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { amount } = req.body;

            if (amount === undefined) {
                res.status(400).json({ success: false, error: 'Timbre fiscal amount is required' });
                return;
            }

            const total = await devisService.updateTimbreFiscal(id as string, Number(amount));

            res.json({ success: true, data: { totalAmount: total } });
        } catch (error) {
            next(error);
        }
    }

    async validate(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const devis = await devisService.validateDevis(id as string, req.user?.id);

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

    async updateStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const devis = await devisService.updateStatus(id as string, status as DevisStatus);

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

    async createCustomDevis(req: Request, res: Response, next: NextFunction) {
        try {
            const { clientId, items, notes } = req.body;

            if (!clientId) {
                res.status(400).json({
                    success: false,
                    error: 'Client ID is required',
                });
                return;
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'At least one item is required',
                });
                return;
            }

            const devis = await devisService.createCustomDevis(req.user!.id, {
                clientId,
                items,
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
    async createEncaissement(req: Request, res: Response, next: NextFunction) {
        try {
            const { clientId, notes } = req.body;

            if (!clientId) {
                res.status(400).json({
                    success: false,
                    error: 'Client ID is required',
                });
                return;
            }

            const encaissement = await devisService.createEncaissement(req.user!.id, {
                clientId,
                notes,
            });

            res.status(201).json({
                success: true,
                data: encaissement,
            });
        } catch (error) {
            next(error);
        }
    }

    async finalizeEncaissement(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { paymentMethod } = req.body;

            const result = await devisService.finalizeEncaissement(
                id as string,
                req.user!.id,
                paymentMethod
            );

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async downloadPDF(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const pdfBuffer = await devisService.generateDevisPDF(id as string);
            const devis = await devisService.getDevisById(id as string);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${devis.reference}.pdf"`
            );
            res.send(pdfBuffer);
        } catch (error) {
            next(error);
        }
    }
}

export const devisController = new DevisController();

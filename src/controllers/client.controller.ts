import { Request, Response, NextFunction } from 'express';
import { clientService } from '../services';

export class ClientController {
    async getAll(_req: Request, res: Response, next: NextFunction) {
        try {
            const clients = await clientService.getAllClients();

            res.json({
                success: true,
                data: clients,
            });
        } catch (error) {
            next(error);
        }
    }

    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const client = await clientService.getClientById(id as string);

            res.json({
                success: true,
                data: client,
            });
        } catch (error) {
            next(error);
        }
    }

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, phone, email, address, notes } = req.body;

            if (!name) {
                res.status(400).json({
                    success: false,
                    error: 'Name is required',
                });
                return;
            }

            const client = await clientService.createClient({
                name,
                phone,
                email,
                address,
                notes,
            });

            res.status(201).json({
                success: true,
                data: client,
            });
        } catch (error) {
            next(error);
        }
    }

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { name, phone, email, address, notes } = req.body;

            const client = await clientService.updateClient(id as string, {
                name,
                phone,
                email,
                address,
                notes,
            });

            res.json({
                success: true,
                data: client,
            });
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const result = await clientService.deleteClient(id as string);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async search(req: Request, res: Response, next: NextFunction) {
        try {
            const { q } = req.query;

            if (!q || typeof q !== 'string') {
                res.status(400).json({
                    success: false,
                    error: 'Search query is required',
                });
                return;
            }

            const clients = await clientService.searchClients(q);

            res.json({
                success: true,
                data: clients,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const clientController = new ClientController();

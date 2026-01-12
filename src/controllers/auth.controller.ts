import { Request, Response, NextFunction } from 'express';
import { authService } from '../services';
import { MachineType } from '../types';

export class AuthController {
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                res.status(400).json({
                    success: false,
                    error: 'Username and password are required',
                });
                return;
            }

            const result = await authService.login(username, password);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async me(req: Request, res: Response, next: NextFunction) {
        try {
            const user = await authService.getCurrentUser(req.user!.id);

            res.json({
                success: true,
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    async getAllUsers(_req: Request, res: Response, next: NextFunction) {
        try {
            const users = await authService.getAllUsers();

            res.json({
                success: true,
                data: users,
            });
        } catch (error) {
            next(error);
        }
    }

    async createUser(req: Request, res: Response, next: NextFunction) {
        try {
            const { username, password, firstName, lastName, role, allowedMachines } = req.body;

            if (!username || !password || !firstName || !lastName) {
                res.status(400).json({
                    success: false,
                    error: 'Username, password, firstName, and lastName are required',
                });
                return;
            }

            const user = await authService.createUser({
                username,
                password,
                firstName,
                lastName,
                role,
                allowedMachines: allowedMachines as MachineType[],
            });

            res.status(201).json({
                success: true,
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    async updateUser(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { firstName, lastName, role, password } = req.body;

            const user = await authService.updateUser(id, {
                firstName,
                lastName,
                role,
                password,
            });

            res.json({
                success: true,
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    async assignMachines(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { machines } = req.body;

            if (!Array.isArray(machines)) {
                res.status(400).json({
                    success: false,
                    error: 'Machines must be an array',
                });
                return;
            }

            const user = await authService.assignMachines(id, machines as MachineType[]);

            res.json({
                success: true,
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    async deactivateUser(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;

            const result = await authService.deactivateUser(id);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const authController = new AuthController();

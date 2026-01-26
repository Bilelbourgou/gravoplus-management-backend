import { Request, Response, NextFunction } from 'express';
import { expenseService } from '../services/expense.service';

export class ExpenseController {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { category, startDate, endDate } = req.query;

            const filters: any = {};
            if (category) filters.category = category as string;
            if (startDate) filters.startDate = new Date(startDate as string);
            if (endDate) filters.endDate = new Date(endDate as string);

            const expenses = await expenseService.getAllExpenses(
                Object.keys(filters).length > 0 ? filters : undefined
            );

            res.json({
                success: true,
                data: expenses,
            });
        } catch (error) {
            next(error);
        }
    }

    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const expense = await expenseService.getExpenseById(id as string);

            res.json({
                success: true,
                data: expense,
            });
        } catch (error) {
            next(error);
        }
    }

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const { description, amount, category, date, reference, notes } = req.body;
            const userId = (req as any).user?.id;

            if (!description) {
                res.status(400).json({
                    success: false,
                    error: 'Description is required',
                });
                return;
            }

            if (!amount || amount <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'Valid amount is required',
                });
                return;
            }

            if (!category) {
                res.status(400).json({
                    success: false,
                    error: 'Category is required',
                });
                return;
            }

            const expense = await expenseService.createExpense(
                {
                    description,
                    amount: parseFloat(amount),
                    category,
                    date: date ? new Date(date) : undefined,
                    reference,
                    notes,
                },
                userId
            );

            res.status(201).json({
                success: true,
                data: expense,
            });
        } catch (error) {
            next(error);
        }
    }

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { description, amount, category, date, reference, notes } = req.body;

            const expense = await expenseService.updateExpense(id as string, {
                description,
                amount: amount ? parseFloat(amount) : undefined,
                category,
                date: date ? new Date(date) : undefined,
                reference,
                notes,
            });

            res.json({
                success: true,
                data: expense,
            });
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const result = await expenseService.deleteExpense(id as string);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    async getStats(req: Request, res: Response, next: NextFunction) {
        try {
            const { startDate, endDate } = req.query;

            const stats = await expenseService.getExpenseStats(
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const expenseController = new ExpenseController();

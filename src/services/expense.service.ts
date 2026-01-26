import prisma from '../config/database';
import { ApiError } from '../middleware';
import { notificationService } from './notification.service';

export interface CreateExpenseDto {
    description: string;
    amount: number;
    category: string;
    date?: Date;
    reference?: string;
    notes?: string;
}

export class ExpenseService {
    /**
     * Get all expenses with optional filters
     */
    async getAllExpenses(filters?: { category?: string; startDate?: Date; endDate?: Date }) {
        const where: any = {};

        if (filters?.category) {
            where.category = filters.category;
        }

        if (filters?.startDate || filters?.endDate) {
            where.date = {};
            if (filters.startDate) {
                where.date.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.date.lte = filters.endDate;
            }
        }

        return prisma.expense.findMany({
            where,
            orderBy: { date: 'desc' },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
    }

    /**
     * Get expense by ID
     */
    async getExpenseById(expenseId: string) {
        const expense = await prisma.expense.findUnique({
            where: { id: expenseId },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        if (!expense) {
            throw new ApiError(404, 'Expense not found');
        }

        return expense;
    }

    /**
     * Create new expense
     */
    async createExpense(data: CreateExpenseDto, userId: string) {
        const expense = await prisma.expense.create({
            data: {
                description: data.description,
                amount: data.amount,
                category: data.category,
                date: data.date || new Date(),
                reference: data.reference,
                notes: data.notes,
                createdById: userId,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        // Create notification
        await notificationService.create({
            type: 'EXPENSE_CREATED',
            title: 'Nouvelle dépense',
            message: `Dépense "${expense.description}" de ${Number(expense.amount).toFixed(2)} TND ajoutée`,
            entityType: 'expense',
            entityId: expense.id,
            triggeredById: userId,
        });

        return expense;
    }

    /**
     * Update expense
     */
    async updateExpense(expenseId: string, data: Partial<CreateExpenseDto>) {
        const expense = await prisma.expense.findUnique({
            where: { id: expenseId },
        });

        if (!expense) {
            throw new ApiError(404, 'Expense not found');
        }

        return prisma.expense.update({
            where: { id: expenseId },
            data: {
                description: data.description,
                amount: data.amount,
                category: data.category,
                date: data.date,
                reference: data.reference,
                notes: data.notes,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
    }

    /**
     * Delete expense
     */
    async deleteExpense(expenseId: string) {
        const expense = await prisma.expense.findUnique({
            where: { id: expenseId },
        });

        if (!expense) {
            throw new ApiError(404, 'Expense not found');
        }

        await prisma.expense.delete({
            where: { id: expenseId },
        });

        return { message: 'Expense deleted successfully' };
    }

    /**
     * Get expense statistics
     */
    async getExpenseStats(startDate?: Date, endDate?: Date) {
        const where: any = {};

        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                where.date.gte = startDate;
            }
            if (endDate) {
                where.date.lte = endDate;
            }
        }

        const expenses = await prisma.expense.findMany({
            where,
            select: {
                amount: true,
                category: true,
            },
        });

        const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

        const byCategory: Record<string, number> = {};
        expenses.forEach((expense) => {
            if (!byCategory[expense.category]) {
                byCategory[expense.category] = 0;
            }
            byCategory[expense.category] += Number(expense.amount);
        });

        return {
            totalAmount,
            count: expenses.length,
            byCategory,
        };
    }
}

export const expenseService = new ExpenseService();

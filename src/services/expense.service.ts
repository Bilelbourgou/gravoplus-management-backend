import prisma from '../config/database';
import { ApiError } from '../middleware';
import { notificationService } from './notification.service';
import { UserRole } from '../types';

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
     * Normalize category names (English to French)
     */
    static normalizeCategory(category: string): string {
        const mapping: Record<string, string> = {
            'MATERIAL': 'Matériel',
            'FOURNITURES': 'Fournitures',
            'SUPPLIES': 'Fournitures',
            'TRANSPORT': 'Transport',
            'MAINTENANCE': 'Maintenance',
            'SALARIES': 'Salaires',
            'LOYER': 'Loyer',
            'RENT': 'Loyer',
            'ÉLECTRICITÉ': 'Électricité',
            'ELECTRICITY': 'Électricité',
            'AUTRE': 'Autre',
            'OTHER': 'Autre',
            'EQUIPMENT': 'Maintenance',
            'UTILITIES': 'Électricité',
            'SALARY': 'Salaires',
            'Materiel': 'Matériel',
            'Electricite': 'Électricité',
            'Equipement': 'Maintenance',
        };

        const upper = category.toUpperCase();
        return mapping[upper] || category;
    }

    /**
     * Get all expenses with optional filters
     */
    async getAllExpenses(filters?: { category?: string; startDate?: Date; endDate?: Date; excludeSuperadmin?: boolean }) {
        const where: any = {};

        if (filters?.category) {
            where.categoryName = filters.category;
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

        // Exclude expenses created by superadmin (for admin users)
        if (filters?.excludeSuperadmin) {
            where.createdBy = { role: { not: UserRole.SUPERADMIN } };

            // Hide expenses from closed periods for admin users
            const lastClosure = await prisma.financialClosure.findFirst({
                where: { scope: 'ADMIN_LEVEL' },
                orderBy: { closureDate: 'desc' },
            });
            if (lastClosure) {
                where.date = {
                    ...where.date,
                    gt: lastClosure.periodEnd,
                };
            }
        }

        return prisma.expense.findMany({
            where,
            orderBy: { date: 'desc' },
            include: {
                category: true,
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
                category: true,
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
        // Verify the category exists before creating
        const categoryExists = await prisma.expenseCategory.findUnique({
            where: { name: data.category },
        });
        if (!categoryExists) {
            throw new ApiError(400, `Catégorie "${data.category}" introuvable. Veuillez créer la catégorie d'abord.`);
        }

        const expense = await prisma.expense.create({
            data: {
                description: data.description,
                amount: data.amount,
                categoryName: data.category,
                date: data.date || new Date(),
                reference: data.reference,
                notes: data.notes,
                createdById: userId,
            },
            include: {
                category: true,
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
                categoryName: data.category,
                date: data.date,
                reference: data.reference,
                notes: data.notes,
            },
            include: {
                category: true,
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
    async getExpenseStats(startDate?: Date, endDate?: Date, excludeSuperadmin?: boolean) {
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

        // Exclude expenses created by superadmin (for admin users)
        if (excludeSuperadmin) {
            where.createdBy = { role: { not: UserRole.SUPERADMIN } };

            // Hide expenses from closed periods for admin users
            const lastClosure = await prisma.financialClosure.findFirst({
                where: { scope: 'ADMIN_LEVEL' },
                orderBy: { closureDate: 'desc' },
            });
            if (lastClosure) {
                where.date = {
                    ...where.date,
                    gt: lastClosure.periodEnd,
                };
            }
        }

        const expenses = await prisma.expense.findMany({
            where,
            select: {
                amount: true,
                categoryName: true,
            },
        });

        const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

        const byCategory: Record<string, number> = {};
        expenses.forEach((expense) => {
            if (!byCategory[expense.categoryName]) {
                byCategory[expense.categoryName] = 0;
            }
            byCategory[expense.categoryName] += Number(expense.amount);
        });

        return {
            totalAmount,
            count: expenses.length,
            byCategory,
        };
    }
}

export const expenseService = new ExpenseService();

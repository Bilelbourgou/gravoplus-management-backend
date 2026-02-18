import prisma from '../config/database';
import { ApiError } from '../middleware';

export interface CreateExpenseCategoryDto {
    name: string;
    color?: string;
    icon?: string;
}

export class ExpenseCategoryService {
    /**
     * Get all categories
     */
    async getAllCategories() {
        return prisma.expenseCategory.findMany({
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Get category by ID or name
     */
    async getCategoryById(id: string) {
        const category = await prisma.expenseCategory.findUnique({
            where: { id },
        });
        if (!category) throw new ApiError(404, 'Category not found');
        return category;
    }

    /**
     * Create new category
     */
    async createCategory(data: CreateExpenseCategoryDto) {
        const existing = await prisma.expenseCategory.findUnique({
            where: { name: data.name },
        });

        if (existing) {
            throw new ApiError(400, 'Category already exists');
        }

        return prisma.expenseCategory.create({
            data: {
                name: data.name,
                color: data.color || '#6c757d',
                icon: data.icon || 'Package',
            },
        });
    }

    /**
     * Update category
     */
    async updateCategory(id: string, data: Partial<CreateExpenseCategoryDto>) {
        const category = await prisma.expenseCategory.findUnique({
            where: { id },
        });

        if (!category) throw new ApiError(404, 'Category not found');

        return prisma.expenseCategory.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete category
     */
    async deleteCategory(id: string) {
        const category = await prisma.expenseCategory.findUnique({
            where: { id },
            include: { _count: { select: { expenses: true } } }
        });

        if (!category) throw new ApiError(404, 'Category not found');

        if (category._count.expenses > 0) {
            throw new ApiError(400, 'Cannot delete category with associated expenses');
        }

        await prisma.expenseCategory.delete({
            where: { id },
        });

        return { message: 'Category deleted successfully' };
    }
}

export const expenseCategoryService = new ExpenseCategoryService();

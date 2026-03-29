import prisma from '../config/database';
import { ApiError } from '../middleware';

export interface CreateMaterialCategoryDto {
    name: string;
    color?: string;
    icon?: string;
}

export class MaterialCategoryService {
    /**
     * Get all categories
     */
    async getAllCategories() {
        return prisma.materialCategory.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { materials: true }
                }
            }
        });
    }

    /**
     * Get category by ID
     */
    async getCategoryById(id: string) {
        const category = await prisma.materialCategory.findUnique({
            where: { id },
            include: {
                materials: true
            }
        });
        if (!category) throw new ApiError(404, 'Category not found');
        return category;
    }

    /**
     * Create new category
     */
    async createCategory(data: CreateMaterialCategoryDto) {
        const existing = await prisma.materialCategory.findUnique({
            where: { name: data.name },
        });

        if (existing) {
            throw new ApiError(400, 'Category already exists');
        }

        return prisma.materialCategory.create({
            data: {
                name: data.name,
                color: data.color || '#6c757d',
                icon: data.icon || 'cube',
            },
        });
    }

    /**
     * Update category
     */
    async updateCategory(id: string, data: Partial<CreateMaterialCategoryDto>) {
        const category = await prisma.materialCategory.findUnique({
            where: { id },
        });

        if (!category) throw new ApiError(404, 'Category not found');

        return prisma.materialCategory.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete category
     */
    async deleteCategory(id: string) {
        const category = await prisma.materialCategory.findUnique({
            where: { id },
            include: { _count: { select: { materials: true } } }
        });

        if (!category) throw new ApiError(404, 'Category not found');

        if (category._count.materials > 0) {
            throw new ApiError(400, 'Cannot delete category with associated materials');
        }

        await prisma.materialCategory.delete({
            where: { id },
        });

        return { message: 'Category deleted successfully' };
    }
}

export const materialCategoryService = new MaterialCategoryService();

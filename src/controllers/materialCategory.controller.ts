import { Request, Response, NextFunction } from 'express';
import { materialCategoryService } from '../services/materialCategory.service';

export class MaterialCategoryController {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const categories = await materialCategoryService.getAllCategories();
            res.json({
                success: true,
                data: categories,
            });
        } catch (error) {
            next(error);
        }
    }

    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id as string;
            const category = await materialCategoryService.getCategoryById(id);
            res.json({
                success: true,
                data: category,
            });
        } catch (error) {
            next(error);
        }
    }

    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const category = await materialCategoryService.createCategory(req.body);
            res.status(201).json({
                success: true,
                data: category,
            });
        } catch (error) {
            next(error);
        }
    }

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id as string;
            const category = await materialCategoryService.updateCategory(id, req.body);
            res.json({
                success: true,
                data: category,
            });
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id as string;
            const result = await materialCategoryService.deleteCategory(id);
            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const materialCategoryController = new MaterialCategoryController();

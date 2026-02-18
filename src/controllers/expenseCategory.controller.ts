import { Request, Response, NextFunction } from 'express';
import { expenseCategoryService } from '../services/expenseCategory.service';

export class ExpenseCategoryController {
    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const categories = await expenseCategoryService.getAllCategories();
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
            const category = await expenseCategoryService.getCategoryById(id);
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
            const category = await expenseCategoryService.createCategory(req.body);
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
            const category = await expenseCategoryService.updateCategory(id, req.body);
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
            const result = await expenseCategoryService.deleteCategory(id);
            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const expenseCategoryController = new ExpenseCategoryController();

import { Router } from 'express';
import { expenseCategoryController } from '../controllers/expenseCategory.controller';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// Category retrieval is public (authenticated) for web/app dropdowns
router.get('/', authenticate, expenseCategoryController.getAll);
router.get('/:id', authenticate, expenseCategoryController.getById);

// Category management is restricted to Admins/Superadmins
router.post('/', authenticate, isAdmin, expenseCategoryController.create);
router.put('/:id', authenticate, isAdmin, expenseCategoryController.update);
router.delete('/:id', authenticate, isAdmin, expenseCategoryController.delete);

export default router;

import { Router } from 'express';
import { materialCategoryController } from '../controllers/materialCategory.controller';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// Category retrieval is public (authenticated) for web/app dropdowns
router.get('/', authenticate, materialCategoryController.getAll);
router.get('/:id', authenticate, materialCategoryController.getById);

// Category management is restricted to Admins/Superadmins
router.post('/', authenticate, isAdmin, materialCategoryController.create);
router.put('/:id', authenticate, isAdmin, materialCategoryController.update);
router.delete('/:id', authenticate, isAdmin, materialCategoryController.delete);

export default router;

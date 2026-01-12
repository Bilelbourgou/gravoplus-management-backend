import { Router } from 'express';
import { materialController } from '../controllers';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Routes accessible by all authenticated users
router.get('/', isEmployeeOrAdmin, materialController.getAll.bind(materialController));

// Admin only routes
router.post('/', isAdmin, materialController.create.bind(materialController));
router.put('/:id', isAdmin, materialController.update.bind(materialController));
router.delete('/:id', isAdmin, materialController.delete.bind(materialController));

export default router;

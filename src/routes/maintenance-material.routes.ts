import { Router } from 'express';
import { maintenanceMaterialController } from '../controllers';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Routes accessible by all authenticated users
router.get('/', isEmployeeOrAdmin, maintenanceMaterialController.getAll.bind(maintenanceMaterialController));

// Admin only routes
router.post('/', isAdmin, maintenanceMaterialController.create.bind(maintenanceMaterialController));
router.put('/:id', isAdmin, maintenanceMaterialController.update.bind(maintenanceMaterialController));
router.delete('/:id', isAdmin, maintenanceMaterialController.delete.bind(maintenanceMaterialController));

export default router;

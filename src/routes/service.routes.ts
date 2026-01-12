import { Router } from 'express';
import { fixedServiceController } from '../controllers';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Routes accessible by all authenticated users
router.get('/', isEmployeeOrAdmin, fixedServiceController.getAll.bind(fixedServiceController));

// Admin only routes
router.post('/', isAdmin, fixedServiceController.create.bind(fixedServiceController));
router.put('/:id', isAdmin, fixedServiceController.update.bind(fixedServiceController));
router.delete('/:id', isAdmin, fixedServiceController.delete.bind(fixedServiceController));

export default router;

import { Router } from 'express';
import { devisController } from '../controllers';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Routes accessible by all authenticated users
router.get('/', isEmployeeOrAdmin, devisController.getAll.bind(devisController));
router.get('/:id', isEmployeeOrAdmin, devisController.getById.bind(devisController));
router.post('/', isEmployeeOrAdmin, devisController.create.bind(devisController));
router.post('/calculate', isEmployeeOrAdmin, devisController.calculate.bind(devisController));

// Line management
router.post('/:id/lines', isEmployeeOrAdmin, devisController.addLine.bind(devisController));
router.delete('/:id/lines/:lineId', isEmployeeOrAdmin, devisController.removeLine.bind(devisController));

// Service management
router.post('/:id/services', isEmployeeOrAdmin, devisController.addService.bind(devisController));
router.delete('/:id/services/:serviceId', isEmployeeOrAdmin, devisController.removeService.bind(devisController));

// Notes
router.patch('/:id/notes', isEmployeeOrAdmin, devisController.updateNotes.bind(devisController));

// Admin only routes
router.post('/:id/validate', isAdmin, devisController.validate.bind(devisController));
router.post('/:id/cancel', isAdmin, devisController.cancel.bind(devisController));

export default router;

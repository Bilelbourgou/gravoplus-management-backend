import { Router } from 'express';
import { clientController } from '../controllers';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Routes accessible by all authenticated users
router.get('/', isEmployeeOrAdmin, clientController.getAll.bind(clientController));
router.get('/search', isEmployeeOrAdmin, clientController.search.bind(clientController));
router.get('/:id', isEmployeeOrAdmin, clientController.getById.bind(clientController));

// Admin only routes
router.post('/', isAdmin, clientController.create.bind(clientController));
router.put('/:id', isAdmin, clientController.update.bind(clientController));
router.delete('/:id', isAdmin, clientController.delete.bind(clientController));

export default router;

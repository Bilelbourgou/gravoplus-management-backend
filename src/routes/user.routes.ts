import { Router } from 'express';
import { authController } from '../controllers';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Admin only routes
router.get('/', isAdmin, authController.getAllUsers.bind(authController));
router.post('/', isAdmin, authController.createUser.bind(authController));
router.put('/:id', isAdmin, authController.updateUser.bind(authController));
router.put('/:id/machines', isAdmin, authController.assignMachines.bind(authController));
router.delete('/:id', isAdmin, authController.deactivateUser.bind(authController));

export default router;

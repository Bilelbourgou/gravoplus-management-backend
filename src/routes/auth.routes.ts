import { Router } from 'express';
import { authController } from '../controllers';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// Public routes
router.post('/login', authController.login.bind(authController));

// Protected routes
router.get('/me', authenticate, authController.me.bind(authController));

export default router;

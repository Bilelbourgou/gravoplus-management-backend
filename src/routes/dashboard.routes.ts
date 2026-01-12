import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// All dashboard routes require authentication and admin role
router.use(authenticate, isAdmin);

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', dashboardController.getStats);

export default router;

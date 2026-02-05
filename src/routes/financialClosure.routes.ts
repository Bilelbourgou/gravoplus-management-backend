
import { Router } from 'express';
import { getFinancialStats, createClosure, getClosureHistory } from '../controllers/financialClosure.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';

const router = Router();

// Protect all routes with authentication and Admin role (assuming Superadmin is technically an ADMIN role)
router.use(authenticate);
router.use(isAdmin);

router.get('/stats', getFinancialStats);
router.post('/close', createClosure);
router.get('/history', getClosureHistory);

export default router;

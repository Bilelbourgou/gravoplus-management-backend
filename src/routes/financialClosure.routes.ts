
import { Router } from 'express';
import { getFinancialStats, createClosure, getClosureHistory, getCaisseDevis } from '../controllers/financialClosure.controller';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Caisse devis - accessible to all authenticated users (role-based filtering inside)
router.get('/caisse', isEmployeeOrAdmin, getCaisseDevis);

// Admin-only routes
router.get('/stats', isAdmin, getFinancialStats);
router.post('/close', isAdmin, createClosure);
router.get('/history', isAdmin, getClosureHistory);

export default router;

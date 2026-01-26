import { Router } from 'express';
import { expenseController } from '../controllers/expense.controller';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// All expense routes require authentication and admin role
router.use(authenticate);
router.use(isAdmin);

// GET /api/expenses - Get all expenses
router.get('/', expenseController.getAll);

// GET /api/expenses/stats - Get expense statistics
router.get('/stats', expenseController.getStats);

// GET /api/expenses/:id - Get expense by ID
router.get('/:id', expenseController.getById);

// POST /api/expenses - Create new expense
router.post('/', expenseController.create);

// PUT /api/expenses/:id - Update expense
router.put('/:id', expenseController.update);

// DELETE /api/expenses/:id - Delete expense
router.delete('/:id', expenseController.delete);

export default router;

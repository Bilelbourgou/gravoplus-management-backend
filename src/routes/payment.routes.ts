import { Router } from 'express';
import { paymentController } from '../controllers';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware';

const router = Router();

router.use(authenticate);

// Caisse payment routes
router.post('/caisse', isEmployeeOrAdmin, paymentController.createCaissePayment.bind(paymentController));
router.get('/devis/:devisId', isEmployeeOrAdmin, paymentController.getPaymentsByDevis.bind(paymentController));

// Legacy invoice-based routes (kept for backward compat)
router.post('/invoice/:invoiceId', isAdmin, paymentController.createPayment.bind(paymentController));
router.get('/invoice/:invoiceId', isAdmin, paymentController.getPaymentsByInvoice.bind(paymentController));
router.get('/invoice/:invoiceId/stats', isAdmin, paymentController.getPaymentStats.bind(paymentController));

// Common routes
router.get('/:id', isEmployeeOrAdmin, paymentController.getPaymentById.bind(paymentController));
router.put('/:id', isAdmin, paymentController.updatePayment.bind(paymentController));
router.delete('/:id', isAdmin, paymentController.deletePayment.bind(paymentController));

export default router;

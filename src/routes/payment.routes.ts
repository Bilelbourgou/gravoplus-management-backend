import { Router } from 'express';
import { paymentController } from '../controllers';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

router.use(authenticate);

router.post('/invoice/:invoiceId', isAdmin, paymentController.createPayment.bind(paymentController));
router.get('/invoice/:invoiceId', isAdmin, paymentController.getPaymentsByInvoice.bind(paymentController));
router.get('/invoice/:invoiceId/stats', isAdmin, paymentController.getPaymentStats.bind(paymentController));
router.get('/:id', isAdmin, paymentController.getPaymentById.bind(paymentController));
router.put('/:id', isAdmin, paymentController.updatePayment.bind(paymentController));
router.delete('/:id', isAdmin, paymentController.deletePayment.bind(paymentController));

export default router;

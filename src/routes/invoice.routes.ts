import { Router } from 'express';
import { invoiceController } from '../controllers';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Admin only routes
router.get('/', isAdmin, invoiceController.getAll.bind(invoiceController));
router.get('/:id', isAdmin, invoiceController.getById.bind(invoiceController));
router.post('/from-devis/:devisId', isAdmin, invoiceController.createFromDevis.bind(invoiceController));
router.get('/:id/pdf', isAdmin, invoiceController.downloadPDF.bind(invoiceController));

export default router;

import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import clientRoutes from './client.routes';
import devisRoutes from './devis.routes';
import invoiceRoutes from './invoice.routes';
import paymentRoutes from './payment.routes';
import machineRoutes from './machine.routes';
import serviceRoutes from './service.routes';
import materialRoutes from './material.routes';
import dashboardRoutes from './dashboard.routes';
import expenseRoutes from './expense.routes';
import notificationRoutes from './notification.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/clients', clientRoutes);
router.use('/devis', devisRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);
router.use('/machines', machineRoutes);
router.use('/services', serviceRoutes);
router.use('/materials', materialRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/expenses', expenseRoutes);
router.use('/notifications', notificationRoutes);

// Health check
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;


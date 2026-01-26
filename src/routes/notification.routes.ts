import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate, isAdmin } from '../middleware';

const router = Router();

// All notification routes require authentication and admin role
router.use(authenticate);
router.use(isAdmin);

// GET /api/notifications - Get all notifications
router.get('/', notificationController.getAll);

// GET /api/notifications/unread - Get unread notifications
router.get('/unread', notificationController.getUnread);

// GET /api/notifications/count - Get unread count
router.get('/count', notificationController.getUnreadCount);

// PUT /api/notifications/read-all - Mark all as read
router.put('/read-all', notificationController.markAllAsRead);

// PUT /api/notifications/:id/read - Mark as read
router.put('/:id/read', notificationController.markAsRead);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', notificationController.delete);

export default router;

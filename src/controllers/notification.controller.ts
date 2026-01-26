import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';

export class NotificationController {
    /**
     * GET /api/notifications
     * Get all notifications
     */
    async getAll(req: Request, res: Response): Promise<void> {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
            const notifications = await notificationService.getAll(limit);
            res.json({ success: true, data: notifications });
        } catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch notifications',
            });
        }
    }

    /**
     * GET /api/notifications/unread
     * Get unread notifications
     */
    async getUnread(req: Request, res: Response): Promise<void> {
        try {
            const notifications = await notificationService.getUnread();
            res.json({ success: true, data: notifications });
        } catch (error) {
            console.error('Error fetching unread notifications:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch unread notifications',
            });
        }
    }

    /**
     * GET /api/notifications/count
     * Get unread notifications count
     */
    async getUnreadCount(req: Request, res: Response): Promise<void> {
        try {
            const count = await notificationService.getUnreadCount();
            res.json({ success: true, data: { count } });
        } catch (error) {
            console.error('Error fetching notification count:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch notification count',
            });
        }
    }

    /**
     * PUT /api/notifications/:id/read
     * Mark notification as read
     */
    async markAsRead(req: Request, res: Response): Promise<void> {
        try {
            const id = req.params.id as string;
            const notification = await notificationService.markAsRead(id);
            res.json({ success: true, data: notification });
        } catch (error) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to mark notification as read',
            });
        }
    }

    /**
     * PUT /api/notifications/read-all
     * Mark all notifications as read
     */
    async markAllAsRead(req: Request, res: Response): Promise<void> {
        try {
            await notificationService.markAllAsRead();
            res.json({ success: true, message: 'All notifications marked as read' });
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to mark all notifications as read',
            });
        }
    }

    /**
     * DELETE /api/notifications/:id
     * Delete a notification
     */
    async delete(req: Request, res: Response): Promise<void> {
        try {
            const id = req.params.id as string;
            await notificationService.delete(id);
            res.json({ success: true, message: 'Notification deleted' });
        } catch (error) {
            console.error('Error deleting notification:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete notification',
            });
        }
    }
}

export const notificationController = new NotificationController();

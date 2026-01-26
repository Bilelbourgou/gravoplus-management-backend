import prisma from '../config/database';
import { emitToAdmins } from '../socket';

export type NotificationType = 
    | 'CLIENT_CREATED'
    | 'CLIENT_UPDATED'
    | 'CLIENT_DELETED'
    | 'DEVIS_CREATED'
    | 'DEVIS_VALIDATED'
    | 'DEVIS_CANCELLED'
    | 'INVOICE_CREATED'
    | 'PAYMENT_RECEIVED'
    | 'EXPENSE_CREATED'
    | 'EXPENSE_DELETED'
    | 'EMPLOYEE_CREATED'
    | 'EMPLOYEE_UPDATED';

export interface CreateNotificationData {
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    triggeredById?: string;
}

export class NotificationService {
    /**
     * Create a new notification
     */
    async create(data: CreateNotificationData) {
        const notification = await prisma.notification.create({
            data: {
                type: data.type,
                title: data.title,
                message: data.message,
                entityType: data.entityType,
                entityId: data.entityId,
                triggeredById: data.triggeredById,
            },
            include: {
                triggeredBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });

        // Emit real-time notification to all admins
        emitToAdmins('notification:new', notification);

        return notification;
    }

    /**
     * Get all notifications (newest first)
     */
    async getAll(limit?: number) {
        return prisma.notification.findMany({
            take: limit || 50,
            orderBy: { createdAt: 'desc' },
            include: {
                triggeredBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
    }

    /**
     * Get unread notifications count
     */
    async getUnreadCount(): Promise<number> {
        return prisma.notification.count({
            where: { isRead: false },
        });
    }

    /**
     * Get unread notifications
     */
    async getUnread() {
        return prisma.notification.findMany({
            where: { isRead: false },
            orderBy: { createdAt: 'desc' },
            include: {
                triggeredBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
    }

    /**
     * Mark notification as read
     */
    async markAsRead(id: string) {
        return prisma.notification.update({
            where: { id },
            data: { isRead: true },
        });
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead() {
        return prisma.notification.updateMany({
            where: { isRead: false },
            data: { isRead: true },
        });
    }

    /**
     * Delete a notification
     */
    async delete(id: string) {
        return prisma.notification.delete({
            where: { id },
        });
    }

    /**
     * Delete old notifications (older than 30 days)
     */
    async deleteOld() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        return prisma.notification.deleteMany({
            where: {
                createdAt: { lt: thirtyDaysAgo },
                isRead: true,
            },
        });
    }
}

export const notificationService = new NotificationService();

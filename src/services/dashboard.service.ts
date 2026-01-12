import prisma from '../config/database';

export interface DashboardStats {
    totalClients: number;
    totalDevis: number;
    totalInvoices: number;
    totalRevenue: number;
    devisByStatus: {
        draft: number;
        validated: number;
        invoiced: number;
        cancelled: number;
    };
    recentDevis: Array<{
        id: string;
        reference: string;
        clientName: string;
        totalAmount: number;
        status: string;
        createdAt: Date;
    }>;
    monthlyRevenue: Array<{
        month: string;
        revenue: number;
    }>;
}

export class DashboardService {
    /**
     * Get dashboard statistics
     */
    async getStats(): Promise<DashboardStats> {
        // Get counts
        const [totalClients, totalDevis, totalInvoices] = await Promise.all([
            prisma.client.count(),
            prisma.devis.count(),
            prisma.invoice.count(),
        ]);

        // Get revenue from invoiced devis
        const invoicedDevis = await prisma.devis.findMany({
            where: { status: 'INVOICED' },
            select: { totalAmount: true },
        });

        const totalRevenue = invoicedDevis.reduce(
            (sum, d) => sum + Number(d.totalAmount),
            0
        );

        // Get devis by status
        const [draft, validated, invoiced, cancelled] = await Promise.all([
            prisma.devis.count({ where: { status: 'DRAFT' } }),
            prisma.devis.count({ where: { status: 'VALIDATED' } }),
            prisma.devis.count({ where: { status: 'INVOICED' } }),
            prisma.devis.count({ where: { status: 'CANCELLED' } }),
        ]);

        // Get recent devis
        const recentDevisRaw = await prisma.devis.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                client: {
                    select: { name: true },
                },
            },
        });

        const recentDevis = recentDevisRaw.map((d) => ({
            id: d.id,
            reference: d.reference,
            clientName: d.client.name,
            totalAmount: Number(d.totalAmount),
            status: d.status,
            createdAt: d.createdAt,
        }));

        // Get monthly revenue for the last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const devisForRevenue = await prisma.devis.findMany({
            where: {
                status: 'INVOICED',
                createdAt: { gte: sixMonthsAgo },
            },
            select: {
                totalAmount: true,
                createdAt: true,
            },
        });

        // Group by month
        const revenueByMonth = new Map<string, number>();
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            revenueByMonth.set(key, 0);
        }

        for (const d of devisForRevenue) {
            const key = `${d.createdAt.getFullYear()}-${String(d.createdAt.getMonth() + 1).padStart(2, '0')}`;
            if (revenueByMonth.has(key)) {
                revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + Number(d.totalAmount));
            }
        }

        const monthlyRevenue = Array.from(revenueByMonth.entries()).map(([month, revenue]) => ({
            month,
            revenue: Math.round(revenue * 100) / 100,
        }));

        return {
            totalClients,
            totalDevis,
            totalInvoices,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            devisByStatus: {
                draft,
                validated,
                invoiced,
                cancelled,
            },
            recentDevis,
            monthlyRevenue,
        };
    }
}

export const dashboardService = new DashboardService();

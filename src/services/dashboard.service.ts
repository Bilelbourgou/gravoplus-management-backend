import prisma from '../config/database';

export interface DashboardStats {
    totalClients: number;
    totalEmployees: number;
    totalDevis: number;
    totalInvoices: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
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
    monthlyExpenses: Array<{
        month: string;
        expenses: number;
    }>;
    expensesByCategory: Record<string, number>;
}

export class DashboardService {
    /**
     * Get dashboard statistics
     */
    async getStats(): Promise<DashboardStats> {
        // Get counts
        const [totalClients, totalEmployees, totalDevis, totalInvoices] = await Promise.all([
            prisma.client.count(),
            prisma.user.count({ where: { role: 'EMPLOYEE', isActive: true } }),
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

        // Get total expenses
        const allExpenses = await prisma.expense.findMany({
            select: { amount: true, category: true, date: true },
        });

        const totalExpenses = allExpenses.reduce(
            (sum, e) => sum + Number(e.amount),
            0
        );

        const netProfit = totalRevenue - totalExpenses;

        // Get expenses by category
        const expensesByCategory: Record<string, number> = {};
        for (const e of allExpenses) {
            expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + Number(e.amount);
        }

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

        // Get monthly expenses for the last 6 months
        const expensesByMonth = new Map<string, number>();
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            expensesByMonth.set(key, 0);
        }

        for (const e of allExpenses) {
            const expenseDate = new Date(e.date);
            const key = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
            if (expensesByMonth.has(key)) {
                expensesByMonth.set(key, (expensesByMonth.get(key) || 0) + Number(e.amount));
            }
        }

        const monthlyExpenses = Array.from(expensesByMonth.entries()).map(([month, expenses]) => ({
            month,
            expenses: Math.round(expenses * 100) / 100,
        }));

        return {
            totalClients,
            totalEmployees,
            totalDevis,
            totalInvoices,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            netProfit: Math.round(netProfit * 100) / 100,
            devisByStatus: {
                draft,
                validated,
                invoiced,
                cancelled,
            },
            recentDevis,
            monthlyRevenue,
            monthlyExpenses,
            expensesByCategory,
        };
    }
}

export const dashboardService = new DashboardService();

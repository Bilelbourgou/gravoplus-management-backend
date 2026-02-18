import prisma from '../config/database';
import { ExpenseService } from './expense.service';

export interface DashboardStats {
    totalClients: number;
    totalEmployees: number;
    totalDevis: number;
    totalInvoices: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    todaysDevisTotal: number;
    todaysInvoicesTotal: number;
    todaysPaymentsTotal: number;
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
    unpaidClients: Array<{
        clientId: string;
        clientName: string;
        totalAmount: number;
        totalPaid: number;
        remaining: number;
    }>;
}

export class DashboardService {
    /**
     * Get dashboard statistics
     */
    async getStats(): Promise<DashboardStats> {
        // Date range for today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Get counts
        const [totalClients, totalEmployees, totalDevis, totalInvoices] = await Promise.all([
            prisma.client.count(),
            prisma.user.count({ where: { role: 'EMPLOYEE', isActive: true } }),
            prisma.devis.count(),
            prisma.invoice.count(),
        ]);

        // Get revenue from all payments (new devis-based flow)
        const allPayments = await prisma.payment.findMany({
            select: { amount: true, paymentDate: true },
        });

        const totalRevenue = allPayments.reduce(
            (sum, p) => sum + Number(p.amount),
            0
        );

        // Get total expenses
        const allExpenses = await prisma.expense.findMany({
            select: { amount: true, categoryName: true, date: true },
        });

        const totalExpenses = allExpenses.reduce(
            (sum, e) => sum + Number(e.amount),
            0
        );

        const netProfit = totalRevenue - totalExpenses;

        // Get expenses by category
        const expensesByCategory: Record<string, number> = {};
        for (const e of allExpenses) {
            expensesByCategory[e.categoryName] = (expensesByCategory[e.categoryName] || 0) + Number(e.amount);
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

        // Get monthly revenue for the last 6 months (from payments)
        const revenueByMonth = new Map<string, number>();
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            revenueByMonth.set(key, 0);
        }

        for (const p of allPayments) {
            const pDate = new Date(p.paymentDate);
            const key = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
            if (revenueByMonth.has(key)) {
                revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + Number(p.amount));
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

        // Calculate daily totals
        const todaysDevis = await prisma.devis.aggregate({
            _sum: {
                totalAmount: true,
            },
            where: {
                createdAt: {
                    gte: todayStart,
                    lte: todayEnd,
                },
            },
        });

        const todaysInvoices = await prisma.invoice.aggregate({
            _sum: {
                totalAmount: true,
            },
            where: {
                createdAt: {
                    gte: todayStart,
                    lte: todayEnd,
                },
            },
        });

        const todaysPayments = await prisma.payment.aggregate({
            _sum: {
                amount: true,
            },
            where: {
                paymentDate: {
                    gte: todayStart,
                    lte: todayEnd,
                },
            },
        });

        // Get clients with unpaid validated devis
        const validatedDevis = await prisma.devis.findMany({
            where: { status: { in: ['VALIDATED', 'INVOICED'] } },
            include: {
                client: { select: { id: true, name: true } },
                payments: { select: { amount: true } },
            },
        });

        const clientBalances = new Map<string, { clientName: string; totalAmount: number; totalPaid: number }>();
        for (const d of validatedDevis) {
            const existing = clientBalances.get(d.clientId) || { clientName: d.client.name, totalAmount: 0, totalPaid: 0 };
            existing.totalAmount += Number(d.totalAmount);
            existing.totalPaid += d.payments.reduce((s, p) => s + Number(p.amount), 0);
            clientBalances.set(d.clientId, existing);
        }

        const unpaidClients = Array.from(clientBalances.entries())
            .map(([clientId, data]) => ({
                clientId,
                clientName: data.clientName,
                totalAmount: Math.round(data.totalAmount * 1000) / 1000,
                totalPaid: Math.round(data.totalPaid * 1000) / 1000,
                remaining: Math.round((data.totalAmount - data.totalPaid) * 1000) / 1000,
            }))
            .filter(c => c.remaining > 0)
            .sort((a, b) => b.remaining - a.remaining);

        return {
            totalClients,
            totalEmployees,
            totalDevis,
            totalInvoices,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            netProfit: Math.round(netProfit * 100) / 100,
            todaysDevisTotal: Number(todaysDevis._sum.totalAmount || 0),
            todaysInvoicesTotal: Number(todaysInvoices._sum.totalAmount || 0),
            todaysPaymentsTotal: Number(todaysPayments._sum.amount || 0),
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
            unpaidClients,
        };
    }
}

export const dashboardService = new DashboardService();

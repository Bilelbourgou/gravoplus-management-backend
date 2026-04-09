import { Router, Request, Response } from 'express';
import { authenticate, isSuperAdmin } from '../middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// GET /api/rapport/yearly?year=2025&month=1&day=1
router.get('/yearly', isSuperAdmin, async (req: Request, res: Response) => {
    try {
        const year = parseInt(req.query.year as string) || new Date().getFullYear();
        const month = req.query.month ? parseInt(req.query.month as string) - 1 : null; // 0-indexed
        const day = req.query.day ? parseInt(req.query.day as string) : null;

        let startDate: Date;
        let endDate: Date;

        if (day !== null && month !== null) {
            startDate = new Date(year, month, day);
            endDate = new Date(year, month, day + 1);
        } else if (month !== null) {
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 1);
        } else {
            startDate = new Date(year, 0, 1);
            endDate = new Date(year + 1, 0, 1);
        }

        const devis = await prisma.devis.findMany({
            where: {
                createdAt: { gte: startDate, lt: endDate },
                OR: [
                    { status: { in: ['VALIDATED', 'INVOICED'] } },
                    { type: 'ENCAISSEMENT' }
                ]
            },
            include: {
                client: true,
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                payments: true,
                invoice: true,
                lines: { include: { material: true } },
                services: { include: { service: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Get all invoices for the period
        const invoices = await prisma.invoice.findMany({
            where: {
                createdAt: { gte: startDate, lt: endDate },
            },
            include: {
                client: true,
                devis: { select: { id: true, reference: true, totalAmount: true } },
                payments: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Get all expenses for the period
        const expenses = await prisma.expense.findMany({
            where: {
                date: { gte: startDate, lt: endDate },
            },
            include: {
                createdBy: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { date: 'desc' },
        });

        // Aggregate productivity by employee
        const revenueByEmployeeMap = new Map<string, { employeeName: string; totalAmount: number; paymentCount: number }>();
        for (const d of devis) {
            if (d.createdBy) {
                const employeeId = d.createdById || 'unknown';
                const employeeName = `${d.createdBy.firstName} ${d.createdBy.lastName}`;
                
                if (!revenueByEmployeeMap.has(employeeId)) {
                    revenueByEmployeeMap.set(employeeId, { employeeName, totalAmount: 0, paymentCount: 0 });
                }
                
                const current = revenueByEmployeeMap.get(employeeId)!;
                current.totalAmount += Number(d.totalAmount);
                current.paymentCount += 1;
                revenueByEmployeeMap.set(employeeId, current);
            }
        }
        const revenueByEmployee = Array.from(revenueByEmployeeMap.entries()).map(([employeeId, data]) => ({
            employeeId,
            ...data
        })).sort((a, b) => b.totalAmount - a.totalAmount);

        // Aggregate productivity by machine
        const machineStatsMap = new Map<string, { totalAmount: number; count: number }>();
        const MachineType = { SERVICE_MAINTENANCE: 'SERVICE_MAINTENANCE', CUSTOM: 'CUSTOM' }; // Mock or import if needed, but strings are fine
        const excludedMachines = [MachineType.SERVICE_MAINTENANCE, MachineType.CUSTOM];

        for (const d of devis) {
            for (const line of d.lines) {
                const machine = line.machineType;
                if (excludedMachines.includes(machine)) continue;

                if (!machineStatsMap.has(machine)) {
                    machineStatsMap.set(machine, { totalAmount: 0, count: 0 });
                }
                
                const current = machineStatsMap.get(machine)!;
                current.totalAmount += Number(line.lineTotal);
                current.count += 1;
                machineStatsMap.set(machine, current);
            }
        }
        const productivityByMachine = Array.from(machineStatsMap.entries()).map(([machine, data]) => ({
            machine,
            ...data
        })).sort((a, b) => b.totalAmount - a.totalAmount);

        // Calculate stats
        const totalDevis = devis.length;
        const totalDevisAmount = devis.reduce((s, d) => s + Number(d.totalAmount), 0);
        const totalInvoices = invoices.length;
        const totalInvoiceAmount = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
        const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

        // Paid vs unpaid
        const devisWithPaymentInfo = devis.map((d) => {
            const totalPaid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
            const totalAmount = Number(d.totalAmount);
            const isFullyPaid = totalPaid >= totalAmount && totalAmount > 0;
            return {
                ...d,
                totalPaid,
                remaining: totalAmount - totalPaid,
                isFullyPaid,
            };
        });

        const paidDevisCount = devisWithPaymentInfo.filter((d) => d.remaining <= 0).length;
        const unpaidDevisCount = devisWithPaymentInfo.filter((d) => d.remaining > 0).length;
        
        const totalPaidAmount = devisWithPaymentInfo.reduce((s, d) => s + Number(d.totalPaid), 0);
        const totalUnpaidAmount = devisWithPaymentInfo.reduce((s, d) => s + Number(d.remaining), 0);

        res.json({
            year,
            month: month !== null ? month + 1 : null,
            day,
            stats: {
                totalDevis,
                totalDevisAmount,
                totalInvoices,
                totalInvoiceAmount,
                totalExpenses,
                paidDevisCount,
                unpaidDevisCount,
                totalPaidAmount,
                totalUnpaidAmount,
                netProfit: totalInvoiceAmount - totalExpenses,
            },
            devis: devisWithPaymentInfo,
            invoices,
            expenses,
            revenueByEmployee,
            productivityByMachine,
        });
    } catch (error: any) {
        console.error('Error fetching yearly report:', error);
        res.status(500).json({ error: 'Failed to fetch yearly report' });
    }
});

// POST /api/rapport/clean?year=2025
router.post('/clean', isSuperAdmin, async (req: Request, res: Response) => {
    try {
        const year = parseInt(req.query.year as string) || new Date().getFullYear();
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year + 1, 0, 1);

        // Find fully-paid devis for the year
        const devis = await prisma.devis.findMany({
            where: {
                createdAt: { gte: startDate, lt: endDate },
                status: 'INVOICED',
            },
            include: { payments: true },
        });

        const fullyPaidDevisIds: string[] = [];
        for (const d of devis) {
            const totalPaid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
            if (totalPaid >= Number(d.totalAmount) && Number(d.totalAmount) > 0) {
                fullyPaidDevisIds.push(d.id);
            }
        }

        if (fullyPaidDevisIds.length === 0) {
            res.json({ message: 'Aucun devis payé à nettoyer', deletedDevis: 0, deletedInvoices: 0 });
            return;
        }

        // Get associated invoice IDs
        const devisWithInvoices = await prisma.devis.findMany({
            where: { id: { in: fullyPaidDevisIds } },
            select: { invoiceId: true },
        });
        const invoiceIds = devisWithInvoices
            .map((d) => d.invoiceId)
            .filter((id): id is string => id !== null);

        // Delete in transaction
        const result = await prisma.$transaction(async (tx) => {
            // Delete payments linked to these devis
            await tx.payment.deleteMany({
                where: { devisId: { in: fullyPaidDevisIds } },
            });

            // Delete devis (cascade deletes lines, services)
            const deletedDevis = await tx.devis.deleteMany({
                where: { id: { in: fullyPaidDevisIds } },
            });

            // Delete invoices (only those with no remaining devis)
            let deletedInvoices = 0;
            if (invoiceIds.length > 0) {
                // Delete payments linked to these invoices
                await tx.payment.deleteMany({
                    where: { invoiceId: { in: invoiceIds } },
                });

                const deleted = await tx.invoice.deleteMany({
                    where: {
                        id: { in: invoiceIds },
                        devis: { none: {} }, // Only if no devis remain linked
                    },
                });
                deletedInvoices = deleted.count;
            }

            return { deletedDevis: deletedDevis.count, deletedInvoices };
        });

        res.json({
            message: `Nettoyage terminé pour l'année ${year}`,
            ...result,
        });
    } catch (error: any) {
        console.error('Error cleaning yearly data:', error);
        res.status(500).json({ error: 'Failed to clean yearly data' });
    }
});

export default router;

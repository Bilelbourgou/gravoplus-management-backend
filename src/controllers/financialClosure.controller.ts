
import { Request, Response } from 'express';
import prisma from '../config/database';
import { UserRole } from '../types';

// Get caisse devis with role-based filtering
// Employee: sees own devis
// Admin: sees employee devis
// SuperAdmin: sees all devis (admin + employee) with full details
export const getCaisseDevis = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role as UserRole;

    const where: any = { status: 'VALIDATED' };

    if (userRole === UserRole.EMPLOYEE) {
      where.createdById = userId;
    } else if (userRole === UserRole.ADMIN) {
      // Admin should not see devis created by superadmin
      where.createdBy = { role: { not: UserRole.SUPERADMIN } };
    }
    // SUPERADMIN sees all devis (no filter)

    const devis = await prisma.devis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        lines: {
          include: { material: true },
          orderBy: { createdAt: 'asc' },
        },
        services: {
          include: { service: true },
        },
        invoice: {
          select: { id: true, reference: true, createdAt: true },
        },
        payments: {
          select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true, createdBy: { select: { firstName: true, lastName: true } } },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    res.json({
      success: true,
      data: devis,
    });
  } catch (error) {
    console.error('Error fetching caisse devis:', error);
    res.status(500).json({ success: false, error: 'Error fetching caisse devis' });
  }
};

// Get current financial stats (since last closure of relevant scope)
export const getFinancialStats = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role as UserRole;
    const closureScope = 'ADMIN_LEVEL';
    // Admin should not see superadmin-created data
    const targetRoles = userRole === UserRole.ADMIN ? [UserRole.EMPLOYEE, UserRole.ADMIN] : [UserRole.EMPLOYEE, UserRole.ADMIN, UserRole.SUPERADMIN];

    // Find the last closure of this specific scope
    const lastClosure = await prisma.financialClosure.findFirst({
      where: { scope: closureScope },
      orderBy: { closureDate: 'desc' },
    });

    const startDate = lastClosure ? lastClosure.periodEnd : new Date(0);
    const endDate = new Date();

    // Fetch Payments (Income) created by target roles
    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
        createdBy: {
          role: { in: targetRoles }
        }
      },
      include: {
        invoice: {
          include: {
            client: { select: { name: true } }
          }
        },
        devis: {
          include: {
            client: { select: { name: true } }
          }
        },
        createdBy: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: { paymentDate: 'desc' },
    });

    // Fetch Expenses created by target roles
    const expenses = await prisma.expense.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        createdBy: {
          role: { in: targetRoles }
        }
      },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Calculate totals
    const totalIncome = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const balance = totalIncome - totalExpense;

    // Aggregate revenue by employee
    const revenueByEmployeeMap = new Map<string, { employeeName: string; totalAmount: number; paymentCount: number }>();

    for (const payment of payments) {
      if (payment.createdBy) {
        const employeeId = payment.createdById || 'unknown';
        const employeeName = `${payment.createdBy.firstName} ${payment.createdBy.lastName}`;

        const current = revenueByEmployeeMap.get(employeeId) || { employeeName, totalAmount: 0, paymentCount: 0 };
        current.totalAmount += Number(payment.amount);
        current.paymentCount += 1;
        revenueByEmployeeMap.set(employeeId, current);
      }
    }

    const revenueByEmployee = Array.from(revenueByEmployeeMap.entries()).map(([employeeId, data]) => ({
      employeeId,
      ...data
    })).sort((a, b) => b.totalAmount - a.totalAmount);

    res.json({
      periodStart: lastClosure ? startDate : null,
      periodEnd: endDate,
      totalIncome,
      totalExpense,
      balance,
      lastClosureDate: lastClosure?.closureDate || null,
      scope: closureScope,
      payments,
      expenses,
      revenueByEmployee,
    });
  } catch (error) {
    console.error('Error fetching financial stats:', error);
    res.status(500).json({ message: 'Error fetching financial stats' });
  }
};

// Create a new closure
export const createClosure = async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role as UserRole;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const closureScope = 'ADMIN_LEVEL';
    // Admin should not see superadmin-created data
    const targetRoles = userRole === UserRole.ADMIN ? [UserRole.EMPLOYEE, UserRole.ADMIN] : [UserRole.EMPLOYEE, UserRole.ADMIN, UserRole.SUPERADMIN];

    // Find last closure of this scope to determine start date
    const lastClosure = await prisma.financialClosure.findFirst({
      where: { scope: closureScope },
      orderBy: { closureDate: 'desc' },
    });

    const startDate = lastClosure ? lastClosure.periodEnd : new Date(0);
    const endDate = new Date();

    // Aggregate Income (Payments by target roles)
    const incomeResult = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: { gte: startDate, lte: endDate },
        createdBy: { role: { in: targetRoles } }
      },
    });

    // Aggregate Expenses (Expenses by target roles)
    const expenseResult = await prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        date: { gte: startDate, lte: endDate },
        createdBy: { role: { in: targetRoles } }
      },
    });

    const totalIncome = Number(incomeResult._sum.amount || 0);
    const totalExpense = Number(expenseResult._sum.amount || 0);
    const balance = totalIncome - totalExpense;

    // Create Closure Record with Scope
    const newClosure = await prisma.financialClosure.create({
      data: {
        periodStart: startDate,
        periodEnd: endDate,
        totalIncome,
        totalExpense,
        balance,
        notes,
        scope: closureScope,
        createdById: userId,
      },
    });

    res.status(201).json(newClosure);
  } catch (error) {
    console.error('Error creating financial closure:', error);
    res.status(500).json({ message: 'Error creating financial closure' });
  }
};

// Get closure history
export const getClosureHistory = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role as UserRole;
    // Both ADMIN and SUPERADMIN see ADMIN_LEVEL closures
    const closureScope = 'ADMIN_LEVEL';

    const closures = await prisma.financialClosure.findMany({
      where: { scope: closureScope },
      orderBy: { closureDate: 'desc' },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    res.json(closures);
  } catch (error) {
    console.error('Error fetching closure history:', error);
    res.status(500).json({ message: 'Error fetching closure history' });
  }
};

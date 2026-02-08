
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get current financial stats (since last closure of relevant scope)
export const getFinancialStats = async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    // Admin closes Employee sessions (EMPLOYEE_LEVEL)
    // Superadmin defaults to EMPLOYEE_LEVEL to see shop stats, but can request ADMIN_LEVEL
    const requestedScope = req.query.scope as string;
    const closureScope = (userRole === 'SUPERADMIN' && requestedScope === 'ADMIN_LEVEL')
      ? 'ADMIN_LEVEL'
      : 'EMPLOYEE_LEVEL';

    // Target roles for transactions
    // If Admin is viewing, they want to see Employee transactions
    // If Superadmin is viewing (default), they want to see Employee transactions too
    const targetRoles = closureScope === 'ADMIN_LEVEL' ? ['ADMIN', 'SUPERADMIN'] : ['EMPLOYEE'];

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
          gt: startDate,
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
          gt: startDate,
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
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const closureScope = userRole === 'SUPERADMIN' ? 'ADMIN_LEVEL' : 'EMPLOYEE_LEVEL';
    const targetRoles = userRole === 'SUPERADMIN' ? ['ADMIN', 'SUPERADMIN'] : ['EMPLOYEE'];

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
        paymentDate: { gt: startDate, lte: endDate },
        createdBy: { role: { in: targetRoles } }
      },
    });

    // Aggregate Expenses (Expenses by target roles)
    const expenseResult = await prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        date: { gt: startDate, lte: endDate },
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
    const userRole = req.user?.role;
    // Show history relevant to the user's closure authority
    // Superadmin sees ADMIN_LEVEL closures (closures made BY Superadmins)
    // Admin sees EMPLOYEE_LEVEL closures (closures made BY Admins)
    const closureScope = userRole === 'SUPERADMIN' ? 'ADMIN_LEVEL' : 'EMPLOYEE_LEVEL';

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


import { Request, Response } from 'express';
import prisma from '../config/database';
import { UserRole, DevisStatus, MachineType } from '../types';

// Get caisse devis with role-based filtering
// Employee: sees own devis
// Admin: sees employee devis
// SuperAdmin: sees all devis (admin + employee) with full details
export const getCaisseDevis = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role as UserRole;

    const lastClosure = await prisma.financialClosure.findFirst({
      orderBy: { periodEnd: 'desc' },
    });
    const startDate = lastClosure ? lastClosure.periodEnd : new Date(0);

    const where: any = { 
        status: DevisStatus.VALIDATED,
        validatedAt: { gte: startDate }
    };

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
          select: { firstName: true, lastName: true, role: true }
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
          select: { firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Calculate totals
    const totalIncome = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const balance = totalIncome - totalExpense;

    // Fetch validated devis in the period for productivity tracking
    const devis = await prisma.devis.findMany({
      where: {
        status: { in: [DevisStatus.VALIDATED, DevisStatus.INVOICED] },
        validatedAt: {
          gte: startDate,
          lte: endDate,
        },
        createdBy: {
          role: { in: targetRoles }
        }
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        lines: {
          select: { machineType: true, lineTotal: true }
        }
      }
    });

    // Aggregate productivity by employee (based on Validated Devis)
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
        current.paymentCount += 1; // Here we use it as devis count
        revenueByEmployeeMap.set(employeeId, current);
      }
    }

    const revenueByEmployee = Array.from(revenueByEmployeeMap.entries()).map(([employeeId, data]) => ({
      employeeId,
      ...data
    })).sort((a, b) => b.totalAmount - a.totalAmount);

    // Aggregate productivity by machine
    const machineStatsMap = new Map<string, { totalAmount: number; count: number }>();
    const excludedMachines = [MachineType.SERVICE_MAINTENANCE, MachineType.CUSTOM];

    for (const d of devis) {
      for (const line of d.lines) {
        const machine = line.machineType as MachineType;
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

    // Scope breakdown for SUPERADMIN
    let adminScope = null;
    let superadminScope = null;
    if (userRole === UserRole.SUPERADMIN) {
      const adminRoles = [UserRole.EMPLOYEE, UserRole.ADMIN];
      const adminPayments = payments.filter((p: any) => adminRoles.includes(p.createdBy?.role));
      const adminExpenses = expenses.filter((e: any) => adminRoles.includes(e.createdBy?.role));
      const saPayments = payments.filter((p: any) => p.createdBy?.role === UserRole.SUPERADMIN);
      const saExpenses = expenses.filter((e: any) => e.createdBy?.role === UserRole.SUPERADMIN);
      const adminIncome = adminPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
      const adminExpense = adminExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
      const saIncome = saPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
      const saExpense = saExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
      adminScope = { totalIncome: adminIncome, totalExpense: adminExpense, balance: adminIncome - adminExpense, payments: adminPayments, expenses: adminExpenses };
      superadminScope = { totalIncome: saIncome, totalExpense: saExpense, balance: saIncome - saExpense, payments: saPayments, expenses: saExpenses };
    }

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
      productivityByMachine,
      adminScope,
      superadminScope,
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
          select: { firstName: true, lastName: true, role: true },
        },
      },
    });

    res.json(closures);
  } catch (error) {
    console.error('Error fetching closure history:', error);
    res.status(500).json({ message: 'Error fetching closure history' });
  }
};

/**
 * app/api/reports/route.ts
 * GET /api/reports?months=6
 * Returns: month-by-month income vs expenses vs savings + dynamic Financial Health Score
 *
 * All responses use the { ok, data } / { ok, error } envelope.
 */
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { calculateHealthScore } from '@/lib/analytics/healthScore';
import { listBudgets } from '@/services/budget.service';
import { listGoals } from '@/services/goal.service';
import { ok, fail } from '@/lib/api-response';
import { Math as FinanceMath, Reports } from '@/lib/finance';

interface MonthlyRow {
  yr:                 number;
  mo:                 number;
  month_label:        string;
  total_spent_minor:  string;
}

interface UserRow {
  monthly_income_minor: string;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const { searchParams } = new URL(req.url);
    const months = Reports.clamp(Number(searchParams.get('months') ?? 6), 1, 24);

    // Get user income (minor units)
    const userRows = await query<UserRow[]>(
      `SELECT monthly_income_minor FROM users WHERE id = ?`,
      [userId]
    );
    const monthlyIncomeMinor = parseInt(userRows[0]?.monthly_income_minor ?? '0', 10);

    // Monthly totals for the past N months (including current)
    const rows = await query<MonthlyRow[]>(`
      SELECT
        YEAR(e.expense_date)                                AS yr,
        MONTH(e.expense_date)                               AS mo,
        DATE_FORMAT(e.expense_date, '%b %Y')                AS month_label,
        COALESCE(SUM(e.amount_minor), 0)                    AS total_spent_minor
      FROM expenses e
      WHERE
        e.user_id = ?
        AND e.deleted_at IS NULL
        AND e.expense_date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MONTH), '%Y-%m-01')
      GROUP BY
        yr,
        mo,
        month_label
      ORDER BY
        yr ASC,
        mo ASC
    `, [userId, months]);

    console.log('[VALIDATION: REPORTS SQL TOTALS]', rows.map(r => ({ month: r.month_label, total_minor: r.total_spent_minor })));


    // Current month context for Health Score
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const latestMonth = rows.find(r => r.mo === currentMonth && r.yr === currentYear);
    const totalSpentMinor = latestMonth ? parseInt(latestMonth.total_spent_minor, 10) : 0;

    const [budgets, goals] = await Promise.all([
      listBudgets({ userId, month: currentMonth, year: currentYear }),
      listGoals({ userId, status: 'active' })
    ]);

    const healthData = calculateHealthScore({
      monthlyIncomeMinor,
      totalSpentMinor,
      budgets,
      goals
    });

    return ok({
      monthlyData: rows.map(r => {
        const spentMinor   = parseInt(r.total_spent_minor, 10);
        const savingsMinor = Reports.calculateSavingsMinor(monthlyIncomeMinor, spentMinor);
        return {
          month:         r.month_label,
          incomeMinor:   monthlyIncomeMinor,
          expensesMinor: spentMinor,
          savingsMinor,
          // Backwards-compat INR floats for the existing chart component
          income:   FinanceMath.minorToInr(monthlyIncomeMinor),
          expenses: FinanceMath.minorToInr(spentMinor),
          savings:  FinanceMath.minorToInr(savingsMinor),
        };
      }),
      health: {
        score:   healthData.score,
        status:  healthData.status,
        details: healthData.details,
        recommendations: healthData.recommendations
      }
    });
  } catch (err) {
    console.error('[GET /api/reports]', err);
    return fail('Failed to fetch reports.', 500);
  }
}

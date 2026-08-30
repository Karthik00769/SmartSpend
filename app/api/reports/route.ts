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
  total_spent_paise:  string;
}

interface UserRow {
  monthly_income_paise: string;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const { searchParams } = new URL(req.url);
    const months = Reports.clamp(Number(searchParams.get('months') ?? 6), 1, 24);

    // Get user income (Paise)
    const userRows = await query<UserRow[]>(
      `SELECT monthly_income_paise FROM users WHERE id = ?`,
      [userId]
    );
    const monthlyIncomePaise = parseInt(userRows[0]?.monthly_income_paise ?? '0', 10);

    // Monthly totals for the past N months (including current)
    const rows = await query<MonthlyRow[]>(`
      SELECT
        YEAR(e.expense_date)                                AS yr,
        MONTH(e.expense_date)                               AS mo,
        DATE_FORMAT(e.expense_date, '%b %Y')                AS month_label,
        COALESCE(SUM(e.amount_paise), 0)                    AS total_spent_paise
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


    // Current month context for Health Score
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const latestMonth = rows.find(r => r.mo === currentMonth && r.yr === currentYear);
    const totalSpentPaise = latestMonth ? parseInt(latestMonth.total_spent_paise, 10) : 0;

    const [budgets, goals] = await Promise.all([
      listBudgets({ userId, month: currentMonth, year: currentYear }),
      listGoals({ userId, status: 'active' })
    ]);

    const healthData = calculateHealthScore({
      monthlyIncomePaise,
      totalSpentPaise,
      budgets,
      goals
    });

    return ok({
      monthlyData: rows.map(r => {
        const spentPaise   = parseInt(r.total_spent_paise, 10);
        const savingsPaise = Reports.calculateSavingsPaise(monthlyIncomePaise, spentPaise);
        return {
          month:         r.month_label,
          incomePaise:   monthlyIncomePaise,
          expensesPaise: spentPaise,
          savingsPaise,
          // Backwards-compat INR floats for the existing chart component
          income:   FinanceMath.paiseToInr(monthlyIncomePaise),
          expenses: FinanceMath.paiseToInr(spentPaise),
          savings:  FinanceMath.paiseToInr(savingsPaise),
        };
      }),
      health: {
        score:   healthData.score,
        status:  healthData.status,
        details: healthData.details
      }
    });
  } catch (err) {
    console.error('[GET /api/reports]', err);
    return fail('Failed to fetch reports.', 500);
  }
}

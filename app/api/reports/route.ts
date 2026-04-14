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

interface MonthlyRow {
  yr:           number;
  mo:           number;
  month_label:  string;
  total_spent:  string;
}

interface UserRow {
  monthly_income: string;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const { searchParams } = new URL(req.url);
    const months = Math.min(Math.max(1, Number(searchParams.get('months') ?? 6)), 24);

    // Get user income for savings calculation
    const userRows = await query<UserRow[]>(
      `SELECT monthly_income FROM users WHERE id = ?`,
      [userId]
    );
    const income = parseFloat(userRows[0]?.monthly_income ?? '0');

    // Monthly totals for the past N months (including current)
    const rows = await query<MonthlyRow[]>(`
      SELECT
        YEAR(e.expense_date)                                AS yr,
        MONTH(e.expense_date)                               AS mo,
        DATE_FORMAT(e.expense_date, '%b %Y')                AS month_label,
        COALESCE(SUM(e.amount), 0)                          AS total_spent
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
    const totalSpent = latestMonth ? parseFloat(latestMonth.total_spent) : 0;

    const [budgets, goals] = await Promise.all([
      listBudgets({ userId, month: currentMonth, year: currentYear }),
      listGoals({ userId, status: 'active' })
    ]);

    const healthData = calculateHealthScore({
      monthlyIncome: income,
      totalSpent,
      budgets,
      goals
    });

    return ok({
      monthlyData: rows.map(r => ({
        month:    r.month_label,
        income,
        expenses: parseFloat(r.total_spent),
        savings:  Math.max(0, income - parseFloat(r.total_spent)),
      })),
      health: {
        score: healthData.score,
        status: healthData.status,
        details: healthData.details
      }
    });
  } catch (err) {
    console.error('[GET /api/reports]', err);
    return fail('Failed to fetch reports.', 500);
  }
}

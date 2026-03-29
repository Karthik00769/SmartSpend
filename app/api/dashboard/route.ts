import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { ok, fail } from '@/lib/api-response';

interface MonthlyStats {
  total_transactions: string;
  total_spent: string;
  daily_avg_spend: string;
  income_spent_pct: string;
}

interface UserRow {
  monthly_income: string;
}

interface CategoryRow {
  category: string;
  total_spent: string;
  limit_amount: string;
  budget_used_pct: string;
  is_over_budget: number;
  remaining_budget: string;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  try {
    const { searchParams } = new URL(req.url);
    const userId = (session.user as any).id as string;
    const now    = new Date();
    const year   = Math.max(2000, Number(searchParams.get('year')  ?? now.getFullYear()));
    const month  = Math.min(12, Math.max(1, Number(searchParams.get('month') ?? now.getMonth() + 1)));

    if (isNaN(year) || isNaN(month)) {
      return fail('Invalid year or month format', 400);
    }

    const [statsRow] = await query<MonthlyStats[]>(`
      SELECT
        COUNT(e.id)                                                         AS total_transactions,
        COALESCE(SUM(e.amount), 0)                                          AS total_spent,
        ROUND(COALESCE(SUM(e.amount), 0) / NULLIF(DAY(LAST_DAY(STR_TO_DATE(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'), '%Y-%m-%d'))), 0), 2) AS daily_avg_spend,
        ROUND(
          (COALESCE(SUM(e.amount), 0) / NULLIF(u.monthly_income, 0)) * 100, 2
        )                                                                   AS income_spent_pct
      FROM users u
      LEFT JOIN expenses e
        ON e.user_id = u.id
       AND YEAR(e.expense_date)  = ?
       AND MONTH(e.expense_date) = ?
      WHERE u.id = ?
      GROUP BY u.id, u.monthly_income
    `, [year, month, year, month, userId]);

    const [userRow] = await query<UserRow[]>(
      `SELECT monthly_income FROM users WHERE id = ?`,
      [userId]
    );

    const totalIncome  = parseFloat(userRow?.monthly_income ?? '0');
    const totalSpent   = parseFloat(statsRow?.total_spent ?? '0');
    const savings      = totalIncome - totalSpent;

    const categories = await query<CategoryRow[]>(`
      SELECT
        COALESCE(e.category, b.category)                 AS category,
        COALESCE(SUM(e.amount), 0)                       AS total_spent,
        COALESCE(b.amount, 0)                            AS limit_amount,
        CASE
          WHEN COALESCE(b.amount, 0) = 0 THEN NULL
          ELSE ROUND((COALESCE(SUM(e.amount), 0) / b.amount) * 100, 2)
        END                                              AS budget_used_pct,
        CASE
          WHEN COALESCE(SUM(e.amount), 0) > COALESCE(b.amount, 0)
           AND COALESCE(b.amount, 0) > 0
          THEN 1 ELSE 0
        END                                              AS is_over_budget,
        COALESCE(b.amount, 0) - COALESCE(SUM(e.amount), 0) AS remaining_budget
      FROM (
        SELECT DISTINCT category FROM expenses WHERE user_id = ? AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?
        UNION
        SELECT DISTINCT category FROM budgets WHERE user_id = ? AND year = ? AND month = ?
      ) as cats
      LEFT JOIN expenses e ON e.category = cats.category AND e.user_id = ? AND YEAR(e.expense_date) = ? AND MONTH(e.expense_date) = ?
      LEFT JOIN budgets b ON b.category = cats.category AND b.user_id = ? AND b.year = ? AND b.month = ?
      GROUP BY COALESCE(e.category, b.category), b.amount
      ORDER BY total_spent DESC
    `, [userId, year, month, userId, year, month, userId, year, month, userId, year, month]);

    const totalBudget = categories.reduce(
      (sum, c) => sum + parseFloat(c.limit_amount), 0
    );

    return ok({
      stats: {
        totalIncome,
        totalExpenses:   totalSpent,
        savings:         savings < 0 ? 0 : savings,
        budgetRemaining: totalBudget - totalSpent,
        currentMonth:    new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        totalTransactions: Number(statsRow?.total_transactions ?? 0),
        dailyAvgSpend:   parseFloat(statsRow?.daily_avg_spend ?? '0'),
        incomeSpentPct:  parseFloat(statsRow?.income_spent_pct ?? '0'),
      },
      chartData: categories.map(c => ({
        name:       c.category,
        value:      parseFloat(c.total_spent),
        percentage: totalSpent > 0
          ? Math.round((parseFloat(c.total_spent) / totalSpent) * 100)
          : 0,
        color: '#6B7280',
        icon:  '📌',
      })),
      budgetCategories: categories.map(c => ({
        category:    c.category,
        icon:        '📌',
        allocated:   parseFloat(c.limit_amount),
        spent:       parseFloat(c.total_spent),
        usedPct:     c.budget_used_pct ? parseFloat(c.budget_used_pct) : null,
        isOverBudget: c.is_over_budget === 1,
        remaining:   parseFloat(c.remaining_budget),
      })),
    });
  } catch (err) {
    console.error('[GET /api/dashboard]', err);
    return fail('Failed to load dashboard data.', 500);
  }
}

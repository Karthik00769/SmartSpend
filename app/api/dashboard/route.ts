import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { ok, fail } from '@/lib/api-response';
import { Analytics, Budget, Math as FinanceMath } from '@/lib/finance';

interface MonthlyStats {
  total_transactions: string;
  total_spent: string;
}

interface UserRow {
  monthly_income: string;
}

interface CategoryRow {
  category: string;
  total_spent: string;
  limit_amount: string;
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
        COALESCE(SUM(e.amount), 0)                                          AS total_spent

      FROM users u
      LEFT JOIN expenses e
        ON e.user_id = u.id
       AND YEAR(e.expense_date)  = ?
       AND MONTH(e.expense_date) = ?
      WHERE u.id = ?
      GROUP BY u.id, u.monthly_income
    `, [year, month, userId]);

    const [userRow] = await query<UserRow[]>(
      `SELECT monthly_income FROM users WHERE id = ?`,
      [userId]
    );

    const totalIncome  = parseFloat(userRow?.monthly_income ?? '0');
    const totalSpent   = parseFloat(statsRow?.total_spent ?? '0');
    const savings      = Analytics.calculateSavings(totalIncome, totalSpent);

    const categories = await query<CategoryRow[]>(`
      SELECT
        COALESCE(e.category, b.category)                 AS category,
        COALESCE(SUM(e.amount), 0)                       AS total_spent,
        COALESCE(b.amount, 0)                            AS limit_amount
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

    let totalBudget = 0;
    for (const c of categories) {
      totalBudget += parseFloat(c.limit_amount);
    }

    return ok({
      stats: {
        totalIncome,
        totalExpenses:   totalSpent,
        savings:         savings < 0 ? 0 : savings,
        budgetRemaining: totalBudget - totalSpent,
        currentMonth:    new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        totalTransactions: Number(statsRow?.total_transactions ?? 0),
        dailyAvgSpend:   Analytics.calculateDailyAvgSpend(totalSpent, new Date(year, month, 0).getDate()),
        incomeSpentPct:  Analytics.calculateCategoryPct(totalSpent, totalIncome),
      },
      chartData: categories.map(c => ({
        name:       c.category,
        value:      parseFloat(c.total_spent),
        percentage: Math.round(Analytics.calculateCategoryPct(parseFloat(c.total_spent), totalSpent)),
        color: '#6B7280',
        icon:  '📌',
      })),
      budgetCategories: categories.map(c => {
        const allocated = parseFloat(c.limit_amount);
        const spent     = parseFloat(c.total_spent);
        
        const allocatedPaise = FinanceMath.inrToPaise(allocated);
        const spentPaise     = FinanceMath.inrToPaise(spent);
        
        const usedPct = allocated > 0 ? Budget.calculateBudgetProgress(spentPaise, allocatedPaise) : null;
        
        return {
          category:    c.category,
          icon:        '📌',
          allocated,
          spent,
          usedPct:     usedPct ? Math.round(usedPct * 100) / 100 : null,
          isOverBudget: Budget.isBudgetExceeded(spentPaise, allocatedPaise),
          status:      Budget.calculateBudgetStatus(spentPaise, allocatedPaise),
          needsAlert:  Budget.needsBudgetAlert(spentPaise, allocatedPaise),
          remaining:   Budget.calculateRemainingBudget(spentPaise, allocatedPaise) / 100,
          month,
          year,
        };
      }),
    });
  } catch (err) {
    console.error('[GET /api/dashboard]', err);
    return fail('Failed to load dashboard data.', 500);
  }
}

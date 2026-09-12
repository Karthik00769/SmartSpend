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
import { listBudgets } from '@/services/budget.service';
import { listGoals } from '@/services/goal.service';
import { ok, fail } from '@/lib/api-response';
import { Math as FinanceMath, Reports } from '@/lib/finance';
import { computeHealthScore, buildMonthOverMonth } from '@/lib/finance/calculations/insights';
import { monthlyExpenseSummary } from '@/services/expense.service';
import { getMonthBoundariesIST, currentMonthIST, currentYearIST } from '@/lib/time/time.service';

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

    // Use IST month boundaries for consistency
    const currentMonth = currentMonthIST();
    const currentYear = currentYearIST();
    
    // Monthly totals for the past N months using IST boundaries
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

    const latestMonth = rows.find(r => r.mo === currentMonth && r.yr === currentYear);
    const totalSpentMinor = latestMonth ? parseInt(latestMonth.total_spent_minor, 10) : 0;

    const [budgets, goals, currentSummary] = await Promise.all([
      listBudgets({ userId, month: currentMonth, year: currentYear }),
      listGoals({ userId, status: 'active' }),
      monthlyExpenseSummary(userId, currentYear, currentMonth)
    ]);

    // Convert goals to probability results for health score
    const goalProbResults = goals.map(g => ({
      goalId: g.id,
      title: g.title,
      targetAmountMinor: g.targetAmountMinor,
      savedAmountMinor: g.savedAmountMinor,
      targetDate: g.deadline,
      daysRemaining: 0,
      requiredDailyAmountMinor: 0,
      actualDailyRateMinor: 0,
      projectedAmountMinor: g.savedAmountMinor,
      achievementPct: g.progressPct,
      probability: g.progressPct >= 70 ? 80 : g.progressPct >= 40 ? 50 : 20,
      risk: 'on_track' as const,
      weeksNeeded: 0,
      recommendation: '',
      milestones: []
    }));

    // Build MoM with empty previous for consistency
    const emptyPrevious = {
      year: currentYear,
      month: currentMonth - 1 || 12,
      totalSpent: 0,
      transactionCount: 0,
      dailyAvg: 0,
      savings: 0,
      savingsRate: 0,
      daysInMonth: 30
    };
    const mom = buildMonthOverMonth(
      currentSummary,
      emptyPrevious,
      budgets.categories.map(c => ({
        categoryId: c.categoryId ?? 0,
        categoryName: c.category,
        totalSpent: c.spentMinor,
        transactionCount: 0,
        budgetLimit: c.allocatedMinor,
        budgetUsed: c.usedPct ?? 0,
        isOverBudget: c.isOverBudget,
        averageTransaction: 0
      })),
      [],
      { year: currentYear, month: currentMonth },
      { year: currentYear, month: currentMonth - 1 || 12 }
    );

    const healthScore = computeHealthScore({
      summary: currentSummary,
      categories: budgets.categories.map(c => ({
        categoryId: c.categoryId ?? 0,
        categoryName: c.category,
        totalSpent: c.spentMinor,
        transactionCount: 0,
        budgetLimit: c.allocatedMinor,
        budgetUsed: c.usedPct ?? 0,
        isOverBudget: c.isOverBudget,
        averageTransaction: 0
      })),
      goals: goalProbResults,
      mom
    });

    const healthData = {
      score: healthScore.overall,
      status: healthScore.overall >= 80 ? 'excellent' as const : 
              healthScore.overall >= 60 ? 'good' as const : 
              healthScore.overall >= 40 ? 'warning' as const : 'critical' as const,
      details: {
        savingsRateScore: Math.round((healthScore.savingsRate / 100) * 35),
        budgetComplianceScore: Math.round((healthScore.budgetCompliance / 100) * 25),
        spendingStabilityScore: Math.round((healthScore.spendingControl / 100) * 15),
        goalProgressScore: Math.round((healthScore.goalProgress / 100) * 25),
        savingsRatePct: currentSummary.savingsRate,
        budgetCompliancePct: healthScore.budgetCompliance,
        savingsRateScorePct: healthScore.savingsRate,
        budgetComplianceScorePct: healthScore.budgetCompliance,
        spendingStabilityScorePct: healthScore.spendingControl,
        goalProgressScorePct: healthScore.goalProgress
      },
      recommendations: [] as string[]
    };

    // Generate recommendations
    if (currentSummary.savingsRate < 20) {
      healthData.recommendations.push(`Increase your savings rate from ${currentSummary.savingsRate.toFixed(1)}% to 20% to boost your score.`);
    }
    const overBudgetCount = budgets.categories.filter(c => c.isOverBudget).length;
    if (overBudgetCount > 0) {
      healthData.recommendations.push(`You have exceeded limits in ${overBudgetCount} category(s). Reign them in to improve your score.`);
    }
    if (goals.length === 0) {
      healthData.recommendations.push("Create a financial goal (e.g. Emergency Fund) to increase your score.");
    }

    return ok({
      monthlyData: rows.map(r => {
        const spentMinor   = parseInt(r.total_spent_minor, 10);
        const savingsMinor = Reports.calculateSavingsMinor(monthlyIncomeMinor, spentMinor);
        return {
          month:         r.month_label,
          incomeMinor:   monthlyIncomeMinor,
          expensesMinor: spentMinor,
          savingsMinor,
          // REMOVED: Duplicate INR conversion (fmt() handles this)
          // Components should use *Minor fields and let fmt() convert
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

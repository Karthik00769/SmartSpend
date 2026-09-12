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
import { computeHealthScore, buildMonthOverMonth, analyzeGoal } from '@/lib/finance/calculations/insights';
import { monthlyExpenseSummary, getMonthlyTrends } from '@/services/expense.service';
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

    // Use IST month boundaries for consistency
    const currentMonth = currentMonthIST();
    const currentYear = currentYearIST();
    
    // Monthly totals for the past N months using centralized engine
    const rows = await getMonthlyTrends(userId, months);

    console.log('[VALIDATION: REPORTS SQL TOTALS]', rows.map(r => ({ month: r.month_label, total_minor: r.total_spent_minor })));

    // Current month context for Health Score

    const [budgets, goals, currentSummary] = await Promise.all([
      listBudgets({ userId, month: currentMonth, year: currentYear }),
      listGoals({ userId, status: 'active' }),
      monthlyExpenseSummary(userId, currentYear, currentMonth)
    ]);

    const goalProbResults = goals.map(g => analyzeGoal(g, Math.max(0, currentSummary.savingsMinor) / 30));

    const mappedCurrentSummary = {
      year: currentYear,
      month: currentMonth,
      label: `${currentYear}-${currentMonth}`,
      totalSpent: currentSummary.totalSpentMinor,
      transactionCount: currentSummary.transactionCount,
      dailyAvg: currentSummary.dailyAvgMinor,
      income: currentSummary.incomeMinor,
      savings: currentSummary.savingsMinor,
      savingsRate: currentSummary.savingsRate,
      topCategory: '',
      topCategorySpend: 0
    };

    // Build MoM with empty previous for consistency
    const emptyPrevious = {
      year: currentYear,
      month: currentMonth - 1 || 12,
      label: `${currentYear}-${currentMonth - 1 || 12}`,
      totalSpent: 0,
      transactionCount: 0,
      dailyAvg: 0,
      income: 0,
      savings: 0,
      savingsRate: 0,
      topCategory: '',
      topCategorySpend: 0
    };
    const mappedCategories = budgets.categories.map(c => ({
      categoryId: c.categoryId ?? 0,
      name: c.category,
      icon: c.icon || '',
      color: c.color || '#000',
      totalSpent: c.spentMinor,
      txCount: 0,
      avgAmount: 0,
      pctOfTotal: c.pctOfTotal ?? 0,
      budgetLimit: c.allocatedMinor,
      budgetUsed: c.usedPct ?? 0,
      isOverBudget: c.isOverBudget,
    }));

    const mom = buildMonthOverMonth(
      mappedCurrentSummary,
      emptyPrevious,
      mappedCategories,
      [],
      { year: currentYear, month: currentMonth },
      { year: currentYear, month: currentMonth - 1 || 12 }
    );

    const healthScore = computeHealthScore({
      summary: mappedCurrentSummary,
      categories: mappedCategories,
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
        const savingsMinor = Reports.calculateSavingsMinor(currentSummary.incomeMinor, spentMinor);
        return {
          month:         r.month_label,
          incomeMinor:   currentSummary.incomeMinor,
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

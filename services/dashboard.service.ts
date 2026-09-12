import { query } from '@/lib/db';
import { Budget, Core, Goals, Math as FinanceMath } from '@/lib/finance';
import { computeHealthScore, analyzeGoal } from '@/lib/finance/calculations/insights';
import type { DashboardSummaryDTO, SmartAlert, BudgetCategoryDTO, ExpenseDTO } from '@/types/api';
import { listBudgets } from './budget.service';
import { listGoals } from './goal.service';
import { fetchInsights } from './insight.service';
import { monthlyExpenseSummary, periodExpenseSummary, categoryWiseTotals, listExpenses, getMonthlyTrends } from './expense.service';
import { currentMonthIST, currentYearIST, startOfWeekIST, endOfWeekIST, getMonthBoundariesIST, formatDateIST } from '@/lib/time/time.service';

interface MonthlyStats {
  total_spent: string;
}

interface CategoryRow {
  category_id: number;
  category: string;
  icon: string;
  color: string;
  total_spent: string;
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummaryDTO> {
  const currentMonth = currentMonthIST();
  const currentYear = currentYearIST();

  // Current user income will be provided by monthlyExpenseSummary

  // Week boundaries in IST
  const thisWeekStartDate = startOfWeekIST();
  const thisWeekEndDate = endOfWeekIST();
  const thisWeekStart = formatDateIST(thisWeekStartDate);
  const thisWeekEnd = formatDateIST(thisWeekEndDate);

  const lastWeekStartDate = new Date(thisWeekStartDate);
  lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
  const lastWeekEndDate = new Date(thisWeekStartDate);
  lastWeekEndDate.setDate(lastWeekEndDate.getDate() - 1);
  const lastWeekStart = formatDateIST(lastWeekStartDate);
  const lastWeekEnd = formatDateIST(lastWeekEndDate);

  // Month boundaries in IST
  const { startStr: currentMonthStart, endStr: currentMonthEnd } = getMonthBoundariesIST(currentYear, currentMonth);

  const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const { startStr: lastMonthStart, endStr: lastMonthEnd } = getMonthBoundariesIST(lastMonthYear, lastMonth);

  // Parallel fetches
  const [
    currentMonthSummary,
    lastMonthSummary,
    thisWeekSummary,
    lastWeekSummary,
    topCategoryRows,
    recentExpenses,
    budgets,
    goals,
    insightsBundle,
  ] = await Promise.all([
    monthlyExpenseSummary(userId, currentYear, currentMonth),
    monthlyExpenseSummary(userId, lastMonthYear, lastMonth),
    periodExpenseSummary(userId, thisWeekStart, thisWeekEnd),
    periodExpenseSummary(userId, lastWeekStart, lastWeekEnd),
    categoryWiseTotals(userId, currentYear, currentMonth),
    listExpenses({ userId, limit: 5 }),
    listBudgets({ userId, month: currentMonth, year: currentYear }),
    listGoals({ userId, status: 'active' }),
    fetchInsights({ userId, unreadOnly: false }),
  ]);

  const totalSpentMinor = currentMonthSummary.totalSpentMinor;
  const lastMonthSpentMinor = lastMonthSummary.totalSpentMinor;
  const thisWeekSpentMinor = thisWeekSummary.totalSpentMinor;
  const lastWeekSpentMinor = lastWeekSummary.totalSpentMinor;

  const monthlyIncomeMinor = currentMonthSummary.incomeMinor;
  const savingsMinor = Math.max(0, currentMonthSummary.savingsMinor);
  const savingsRate = Math.max(0, Math.round(currentMonthSummary.savingsRate));

  const monthlyGrowthPct = Math.round(Core.calculateGrowthPct(totalSpentMinor, lastMonthSpentMinor));

  const budgetCategories = budgets.categories;
  const compliantCount = budgetCategories.filter((c) => !c.isOverBudget).length;
  const budgetCompliancePct = budgetCategories.length > 0
    ? Math.round(Core.calculateCategoryPercentage(compliantCount, budgetCategories.length))
    : 0;
    
  const incomeSpentPct = Math.round(currentMonthSummary.incomeSpentPct || 0);
  const dailyAvgSpendMinor = Math.round(currentMonthSummary.dailyAvgMinor || 0);
  const totalBudgetMinor = budgets.totalBudgetMinor || 0;
  const budgetRemainingMinor = budgets.totalRemainingMinor || 0;

  // Smart Alerts
  const alerts: SmartAlert[] = [];

  for (const b of budgetCategories) {
    if (b.isOverBudget) {
      alerts.push({
        id: `budget-exceeded-${b.categoryId}`,
        level: 'critical',
        emoji: '🚨',
        title: `${b.icon} ${b.category} budget exceeded`,
        detail: `${FinanceMath.minorToInr(Math.abs(b.remainingMinor))} over your ${FinanceMath.minorToInr(b.allocatedMinor)} limit.`,
        href: '/budgets',
        hrefLabel: 'Review budget',
      });
    } else if (b.needsAlert) {
      alerts.push({
        id: `budget-warning-${b.categoryId}`,
        level: 'warning',
        emoji: '⚠️',
        title: `${b.icon} ${b.category} at ${b.usedPct?.toFixed(0) ?? '0'}%`,
        detail: `${FinanceMath.minorToInr(b.remainingMinor)} remaining of your ${FinanceMath.minorToInr(b.allocatedMinor)} limit.`,
        href: '/budgets',
        hrefLabel: 'View budget',
      });
    }
  }

  if (lastWeekSpentMinor > 1000 && thisWeekSpentMinor > lastWeekSpentMinor * 1.5) {
    const spikePct = Math.round(Core.calculateGrowthPct(thisWeekSpentMinor, lastWeekSpentMinor));
    alerts.push({
      id: 'spending-spike',
      level: 'warning',
      emoji: '📈',
      title: `Spending spike this week (+${spikePct}%)`,
      detail: `${FinanceMath.minorToInr(thisWeekSpentMinor)} this week vs ${FinanceMath.minorToInr(lastWeekSpentMinor)} last week.`,
      href: '/expenses-history',
      hrefLabel: 'Review transactions',
    });
  }

  const MILESTONES = [100, 75, 50, 25];
  for (const g of goals) {
    const pct = g.progressPct;
    for (const milestone of MILESTONES) {
      if (pct >= milestone) {
        alerts.push({
          id: `goal-milestone-${g.id}-${milestone}`,
          level: milestone === 100 ? 'success' : 'info',
          emoji: milestone === 100 ? '🏆' : milestone >= 75 ? '🎯' : milestone >= 50 ? '💪' : '🌱',
          title: milestone === 100
            ? `Goal "${g.title}" completed!`
            : `${milestone}% milestone — "${g.title}"`,
          detail: `${FinanceMath.minorToInr(g.savedAmountMinor)} of ${FinanceMath.minorToInr(g.targetAmountMinor)} saved.`,
          href: '/goals',
          hrefLabel: 'View goals',
        });
        break;
      }
    }
  }

  const order: Record<SmartAlert['level'], number> = { critical: 0, warning: 1, info: 2, success: 3 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  const topCategories: BudgetCategoryDTO[] = topCategoryRows.map(row => {
    const b = budgetCategories.find(bc => bc.categoryId === row.categoryId);
    const spentMinor = Number(row.totalMinor);
    const pctOfTotal = Core.calculateCategoryPercentage(spentMinor, totalSpentMinor);
    
    if (b) {
      return { ...b, pctOfTotal };
    }
    return {
      id: 0,
      categoryId: row.categoryId,
      category: row.name,
      icon: row.icon,
      color: '#6B7280',
      allocatedMinor: 0,
      spentMinor,
      pctOfTotal,
      usedPct: null,
      isOverBudget: false,
      status: 'safe',
      needsAlert: false,
      remainingMinor: -spentMinor,
      month: currentMonth,
      year: currentYear,
    };
  });

  // listExpenses returns ExpenseDTO array, no need to remap
  // Keep existing types
  const recentExpensesArray: ExpenseDTO[] = recentExpenses;

  // 6-month spend trend
  const startYear = currentMonth >= 6 ? currentYear : currentYear - 1;
  const startMonth = currentMonth >= 6 ? currentMonth - 5 : 12 - (5 - currentMonth);
  const { startStr: trendStart } = getMonthBoundariesIST(startYear, startMonth);

  const trendRows = await getMonthlyTrends(userId, 6);

  const monthlyTrend = trendRows.map(r => ({ label: r.month_label, spentMinor: Number(r.total_spent_minor) }));

  // Use unified health score engine
  const healthScore = computeHealthScore({
    summary: {
      year: currentYear,
      month: currentMonth,
      label: `${currentYear}-${currentMonth}`,
      totalSpent: totalSpentMinor,
      transactionCount: 0,
      dailyAvg: 0,
      income: monthlyIncomeMinor,
      savings: Math.max(0, currentMonthSummary.savingsMinor),
      savingsRate: currentMonthSummary.savingsRate,
      topCategory: '',
      topCategorySpend: 0
    },
    categories: topCategories.map(c => ({
      categoryId: c.categoryId,
      name: c.category,
      icon: c.icon,
      color: c.color,
      totalSpent: c.spentMinor,
      txCount: 0,
      avgAmount: 0,
      pctOfTotal: c.pctOfTotal ?? 0,
      budgetLimit: c.allocatedMinor,
      budgetUsed: c.usedPct ?? 0,
      isOverBudget: c.isOverBudget,
    })),
    goals: goals.map(g => analyzeGoal(g, Math.max(0, savingsMinor) / 30)),
    mom: {
      currentMonth: { year: currentYear, month: currentMonth },
      previousMonth: { year: currentYear, month: currentMonth - 1 || 12 },
      totalSpend: { current: totalSpentMinor, previous: 0, absolute: 0, percentage: 0, direction: 'stable' as const, isSignificant: false },
      txCount: { current: 0, previous: 0, absolute: 0, percentage: 0, direction: 'stable' as const, isSignificant: false },
      dailyAvg: { current: 0, previous: 0, absolute: 0, percentage: 0, direction: 'stable' as const, isSignificant: false },
      savings: { current: 0, previous: 0, absolute: 0, percentage: 0, direction: 'stable' as const, isSignificant: false },
      savingsRate: { current: 0, previous: 0, absolute: 0, percentage: 0, direction: 'stable' as const, isSignificant: false },
      categories: []
    }
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
      goalProgressScore: Math.round((healthScore.goalProgress / 100) * 25)
    }
  };

  return {
    totalSpentMinor,
    totalIncomeMinor: monthlyIncomeMinor,
    savingsMinor,
    savingsRate,
    incomeSpentPct,
    dailyAvgSpendMinor,
    monthlyGrowthPct,
    totalBudgetMinor,
    budgetRemainingMinor,
    budgetCompliancePct,
    healthScore: healthData.score,
    healthStatus: healthData.status,
    topCategories,
    recentExpenses,
    goals,
    recentInsights: insightsBundle.insights.slice(0, 5),
    monthlyTrend,
    alerts,
  };
}

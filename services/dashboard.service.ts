import { query } from '@/lib/db';
import { Budget, Core, Goals, Math as FinanceMath } from '@/lib/finance';
import { computeHealthScore } from '@/lib/finance/calculations/insights';
import type { DashboardSummaryDTO, SmartAlert, BudgetCategoryDTO, ExpenseDTO } from '@/types/api';
import { listBudgets } from './budget.service';
import { listGoals } from './goal.service';
import { fetchInsights } from './insight.service';
import { currentMonthIST, currentYearIST, startOfWeekIST, endOfWeekIST, getMonthBoundariesIST, formatDateIST } from '@/lib/time/time.service';

interface MonthlyStats {
  total_spent: string;
}

interface CategoryRow {
  category_id: number;
  category:    string;
  icon:        string;
  color:       string;
  total_spent: string;
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummaryDTO> {
  const currentMonth = currentMonthIST();
  const currentYear = currentYearIST();

  // Current user income
  const [userRow] = await query<{ monthly_income_minor: string }[]>(
    `SELECT monthly_income_minor FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const monthlyIncomeMinor = Number(userRow?.monthly_income_minor ?? 0);

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
    [currentMonthStats],
    [lastMonthStats],
    [thisWeekStats],
    [lastWeekStats],
    topCategoryRows,
    recentExpenseRows,
    budgets,
    goals,
    insightsBundle,
  ] = await Promise.all([
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND expense_date >= ? AND expense_date < ?`,
      [userId, currentMonthStart, currentMonthEnd],
    ),
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND expense_date >= ? AND expense_date < ?`,
      [userId, lastMonthStart, lastMonthEnd],
    ),
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND expense_date >= ? AND expense_date <= ?`,
      [userId, thisWeekStart, thisWeekEnd],
    ),
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND expense_date >= ? AND expense_date <= ?`,
      [userId, lastWeekStart, lastWeekEnd],
    ),
    query<CategoryRow[]>(
      `SELECT c.id AS category_id, c.name AS category, c.icon, c.color_hex AS color, COALESCE(SUM(e.amount_minor), 0) AS total_spent
       FROM expenses e
       JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = ? AND e.deleted_at IS NULL AND e.expense_date >= ? AND e.expense_date < ?
       GROUP BY c.id
       ORDER BY total_spent DESC LIMIT 5`,
      [userId, currentMonthStart, currentMonthEnd],
    ),
    query<any[]>(
      `SELECT e.id, e.amount_minor, DATE_FORMAT(e.expense_date, '%Y-%m-%d') as date, e.description,
              c.id AS category_id, c.name AS category_name, c.icon AS category_icon, e.source, e.created_at
       FROM expenses e
       JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = ? AND e.deleted_at IS NULL
       ORDER BY e.expense_date DESC, e.id DESC LIMIT 5`,
      [userId],
    ),
    listBudgets({ userId, month: currentMonth, year: currentYear }),
    listGoals({ userId, status: 'active' }),
    fetchInsights({ userId, unreadOnly: false }),
  ]);

  const totalSpentMinor    = Number(currentMonthStats?.total_spent ?? 0);
  const lastMonthSpentMinor = Number(lastMonthStats?.total_spent ?? 0);
  const thisWeekSpentMinor = Number(thisWeekStats?.total_spent ?? 0);
  const lastWeekSpentMinor = Number(lastWeekStats?.total_spent ?? 0);

  const savingsMinor = Math.max(0, Core.calculateSavings(monthlyIncomeMinor, totalSpentMinor));
  const savingsRate  = Math.max(0, Math.round(Core.calculateSavingsRate(monthlyIncomeMinor, totalSpentMinor)));

  const monthlyGrowthPct = Math.round(Core.calculateGrowthPct(totalSpentMinor, lastMonthSpentMinor));

  const budgetCategories   = budgets.categories;
  const compliantCount     = budgetCategories.filter((c) => !c.isOverBudget).length;
  const budgetCompliancePct = budgetCategories.length > 0
    ? Math.round(Core.calculateCategoryPercentage(compliantCount, budgetCategories.length))
    : 0;

  // Smart Alerts
  const alerts: SmartAlert[] = [];

  for (const b of budgetCategories) {
    if (b.isOverBudget) {
      alerts.push({
        id:        `budget-exceeded-${b.categoryId}`,
        level:     'critical',
        emoji:     '🚨',
        title:     `${b.icon} ${b.category} budget exceeded`,
        detail:    `${FinanceMath.minorToInr(Math.abs(b.remainingMinor))} over your ${FinanceMath.minorToInr(b.allocatedMinor)} limit.`,
        href:      '/budgets',
        hrefLabel: 'Review budget',
      });
    } else if (b.needsAlert) {
      alerts.push({
        id:        `budget-warning-${b.categoryId}`,
        level:     'warning',
        emoji:     '⚠️',
        title:     `${b.icon} ${b.category} at ${b.usedPct?.toFixed(0) ?? '0'}%`,
        detail:    `${FinanceMath.minorToInr(b.remainingMinor)} remaining of your ${FinanceMath.minorToInr(b.allocatedMinor)} limit.`,
        href:      '/budgets',
        hrefLabel: 'View budget',
      });
    }
  }

  if (lastWeekSpentMinor > 1000 && thisWeekSpentMinor > lastWeekSpentMinor * 1.5) {
    const spikePct = Math.round(Core.calculateGrowthPct(thisWeekSpentMinor, lastWeekSpentMinor));
    alerts.push({
      id:        'spending-spike',
      level:     'warning',
      emoji:     '📈',
      title:     `Spending spike this week (+${spikePct}%)`,
      detail:    `${FinanceMath.minorToInr(thisWeekSpentMinor)} this week vs ${FinanceMath.minorToInr(lastWeekSpentMinor)} last week.`,
      href:      '/expenses-history',
      hrefLabel: 'Review transactions',
    });
  }

  const MILESTONES = [100, 75, 50, 25];
  for (const g of goals) {
    const pct = g.progressPct;
    for (const milestone of MILESTONES) {
      if (pct >= milestone) {
        alerts.push({
          id:        `goal-milestone-${g.id}-${milestone}`,
          level:     milestone === 100 ? 'success' : 'info',
          emoji:     milestone === 100 ? '🏆' : milestone >= 75 ? '🎯' : milestone >= 50 ? '💪' : '🌱',
          title:     milestone === 100
            ? `Goal "${g.title}" completed!`
            : `${milestone}% milestone — "${g.title}"`,
          detail:    `${FinanceMath.minorToInr(g.savedAmountMinor)} of ${FinanceMath.minorToInr(g.targetAmountMinor)} saved.`,
          href:      '/goals',
          hrefLabel: 'View goals',
        });
        break;
      }
    }
  }

  const order: Record<SmartAlert['level'], number> = { critical: 0, warning: 1, info: 2, success: 3 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  const topCategories: BudgetCategoryDTO[] = topCategoryRows.map(row => {
    const b          = budgetCategories.find(bc => bc.categoryId === row.category_id);
    const spentMinor = Number(row.total_spent);
    return b || {
      id:             0,
      categoryId:     row.category_id,
      category:       row.category,
      icon:           row.icon,
      color:          row.color,
      allocatedMinor: 0,
      spentMinor,
      usedPct:        null,
      isOverBudget:   false,
      status:         'safe',
      needsAlert:     false,
      remainingMinor: -spentMinor,
      month:          currentMonth,
      year:           currentYear,
    };
  });

  const recentExpenses: ExpenseDTO[] = recentExpenseRows.map(r => ({
    id:           String(r.id),
    userId,
    categoryId:   r.category_id,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    source:       r.source,
    amountMinor:  Number(r.amount_minor),
    date:         r.date,
    description:  r.description || '',
    createdAt:    r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  // 6-month spend trend
  const startYear = currentMonth >= 6 ? currentYear : currentYear - 1;
  const startMonth = currentMonth >= 6 ? currentMonth - 5 : 12 - (5 - currentMonth);
  const { startStr: trendStart } = getMonthBoundariesIST(startYear, startMonth);

  const trendRows = await query<{ month_label: string; total_spent: string }[]>(
    `SELECT DATE_FORMAT(expense_date, '%b') AS month_label,
            COALESCE(SUM(amount_minor), 0) AS total_spent
     FROM expenses
     WHERE user_id = ? AND deleted_at IS NULL
       AND expense_date >= ?
     GROUP BY YEAR(expense_date), MONTH(expense_date), month_label
     ORDER BY YEAR(expense_date) ASC, MONTH(expense_date) ASC`,
    [userId, trendStart],
  );

  const monthlyTrend = trendRows.map(r => ({ label: r.month_label, spentMinor: Number(r.total_spent) }));

  // Use unified health score engine
  const healthScore = computeHealthScore({
    summary: {
      year: currentYear,
      month: currentMonth,
      totalSpent: totalSpentMinor,
      transactionCount: 0,
      dailyAvg: 0,
      savings: Math.max(0, monthlyIncomeMinor - totalSpentMinor),
      savingsRate: Core.calculateSavingsRate(monthlyIncomeMinor, totalSpentMinor),
      daysInMonth: 30
    },
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
    goals: goals.map(g => ({
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
    })),
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
    monthlyGrowthPct,
    budgetCompliancePct,
    healthScore:  healthData.score,
    healthStatus: healthData.status,
    topCategories,
    recentExpenses,
    goals,
    recentInsights: insightsBundle.insights.slice(0, 5),
    monthlyTrend,
    alerts,
  };
}

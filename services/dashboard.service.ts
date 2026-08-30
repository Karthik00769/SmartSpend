import { query } from '@/lib/db';
import { Analytics, Budget, Goals, Math as FinanceMath } from '@/lib/finance';
import type { DashboardSummaryDTO, SmartAlert, BudgetCategoryDTO, ExpenseDTO } from '@/types/api';
import { listBudgets } from './budget.service';
import { listGoals } from './goal.service';
import { fetchInsights } from './insight.service';

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
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Get current user income
  const [userRow] = await query<{ monthly_income_paise: string }[]>(
    `SELECT monthly_income_paise FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const monthlyIncomePaise = Number(userRow?.monthly_income_paise ?? 0);

  // Weekly spending dates
  const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon
  const thisMonStart = new Date(now);
  thisMonStart.setDate(now.getDate() - dayOfWeek);
  const thisWeekStart = thisMonStart.toISOString().slice(0, 10);
  
  const lastMonStart = new Date(thisMonStart);
  lastMonStart.setDate(thisMonStart.getDate() - 7);
  const lastWeekStart = lastMonStart.toISOString().slice(0, 10);
  
  const lastWeekEnd = new Date(thisMonStart);
  lastWeekEnd.setDate(thisMonStart.getDate() - 1);
  const lastWeekEndStr = lastWeekEnd.toISOString().slice(0, 10);
  
  const todayStr = now.toISOString().slice(0, 10);

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
    insightsBundle
  ] = await Promise.all([
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_paise), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?`,
      [userId, currentYear, currentMonth]
    ),
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_paise), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?`,
      [userId, currentMonth === 1 ? currentYear - 1 : currentYear, currentMonth === 1 ? 12 : currentMonth - 1]
    ),
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_paise), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND expense_date >= ? AND expense_date <= ?`,
      [userId, thisWeekStart, todayStr]
    ),
    query<MonthlyStats[]>(
      `SELECT COALESCE(SUM(amount_paise), 0) AS total_spent FROM expenses WHERE user_id = ? AND deleted_at IS NULL AND expense_date >= ? AND expense_date <= ?`,
      [userId, lastWeekStart, lastWeekEndStr]
    ),
    query<CategoryRow[]>(
      `SELECT c.id AS category_id, c.name AS category, c.icon, c.color, COALESCE(SUM(e.amount_paise), 0) AS total_spent
       FROM expenses e
       JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = ? AND e.deleted_at IS NULL AND YEAR(e.expense_date) = ? AND MONTH(e.expense_date) = ?
       GROUP BY c.id
       ORDER BY total_spent DESC LIMIT 5`,
      [userId, currentYear, currentMonth]
    ),
    query<any[]>(
      `SELECT e.id, e.amount_paise, DATE_FORMAT(e.expense_date, '%Y-%m-%d') as date, e.description,
              c.id AS category_id, c.name AS category_name, c.icon AS category_icon, e.source, e.created_at
       FROM expenses e
       JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = ? AND e.deleted_at IS NULL
       ORDER BY e.expense_date DESC, e.id DESC LIMIT 5`,
      [userId]
    ),
    listBudgets({ userId, month: currentMonth, year: currentYear }),
    listGoals({ userId, status: 'active' }),
    fetchInsights({ userId, unreadOnly: false })
  ]);

  const totalSpentPaise = Number(currentMonthStats?.total_spent ?? 0);
  const lastMonthSpentPaise = Number(lastMonthStats?.total_spent ?? 0);
  const thisWeekSpentPaise = Number(thisWeekStats?.total_spent ?? 0);
  const lastWeekSpentPaise = Number(lastWeekStats?.total_spent ?? 0);

  const savingsPaise = Math.max(0, Analytics.calculateSavings(monthlyIncomePaise, totalSpentPaise));
  const savingsRate = Math.max(0, Math.round(Analytics.calculateSavingsRate(monthlyIncomePaise, totalSpentPaise)));
  
  const monthlyGrowthPct = Math.round(Analytics.calculateGrowthPct(totalSpentPaise, lastMonthSpentPaise));

  const budgetCategories = budgets.categories;
  const compliantCount = budgetCategories.filter((c) => !c.isOverBudget).length;
  const budgetCompliancePct = budgetCategories.length > 0
    ? Math.round(Analytics.calculateCategoryPct(compliantCount, budgetCategories.length))
    : 0;

  // Compute Alerts using FinanceCore / precomputed aggregations
  const alerts: SmartAlert[] = [];
  
  for (const b of budgetCategories) {
    if (b.isOverBudget) {
      alerts.push({
        id:        `budget-exceeded-${b.categoryId}`,
        level:     'critical',
        emoji:     '🚨',
        title:     `${b.icon} ${b.category} budget exceeded`,
        detail:    `₹${Math.abs(b.remainingPaise) / 100} over your ₹${b.allocatedPaise / 100} limit.`,
        href:      '/budgets',
        hrefLabel: 'Review budget',
      });
    } else if (b.needsAlert) {
      alerts.push({
        id:        `budget-warning-${b.categoryId}`,
        level:     'warning',
        emoji:     '⚠️',
        title:     `${b.icon} ${b.category} at ${b.usedPct?.toFixed(0) ?? '0'}%`,
        detail:    `₹${b.remainingPaise / 100} remaining of your ₹${b.allocatedPaise / 100} limit.`,
        href:      '/budgets',
        hrefLabel: 'View budget',
      });
    }
  }

  if (lastWeekSpentPaise > 1000 && thisWeekSpentPaise > lastWeekSpentPaise * 1.5) {
    const spikePct = Math.round(Analytics.calculateGrowthPct(thisWeekSpentPaise, lastWeekSpentPaise));
    alerts.push({
      id:        'spending-spike',
      level:     'warning',
      emoji:     '📈',
      title:     `Spending spike this week (+${spikePct}%)`,
      detail:    `₹${thisWeekSpentPaise / 100} this week vs ₹${lastWeekSpentPaise / 100} last week.`,
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
          detail:    `₹${g.savedAmountPaise / 100} of ₹${g.targetAmountPaise / 100} saved.`,
          href:      '/goals',
          hrefLabel: 'View goals',
        });
        break;
      }
    }
  }

  const order: Record<SmartAlert['level'], number> = { critical: 0, warning: 1, info: 2, success: 3 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  // Compute top categories by finding their budget if it exists
  const topCategories: BudgetCategoryDTO[] = topCategoryRows.map(row => {
    const b = budgetCategories.find(bc => bc.categoryId === row.category_id);
    const spentPaise = Number(row.total_spent);
    return b || {
      id: 0,
      categoryId: row.category_id,
      category: row.category,
      icon: row.icon,
      color: row.color,
      allocatedPaise: 0,
      spentPaise: spentPaise,
      usedPct: null,
      isOverBudget: false,
      status: 'safe',
      needsAlert: false,
      remainingPaise: -spentPaise,
      month: currentMonth,
      year: currentYear
    };
  });

  const recentExpenses: ExpenseDTO[] = recentExpenseRows.map(r => ({
    id: String(r.id),
    userId: userId,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    source: r.source,
    amountPaise: Number(r.amount_paise),
    date: r.date,
    description: r.description || '',
    createdAt: r.created_at.toISOString()
  }));

  // Fetch 6-month trends
  const trendRows = await query<{ month_label: string, total_spent: string }[]>(
    `SELECT DATE_FORMAT(expense_date, '%b') AS month_label,
            COALESCE(SUM(amount_paise), 0) AS total_spent
     FROM expenses
     WHERE user_id = ? AND deleted_at IS NULL
       AND expense_date >= DATE_SUB(DATE_FORMAT(NOW() ,'%Y-%m-01'), INTERVAL 5 MONTH)
     GROUP BY YEAR(expense_date), MONTH(expense_date), month_label
     ORDER BY YEAR(expense_date) ASC, MONTH(expense_date) ASC`,
    [userId]
  );
  
  const monthlyTrend = trendRows.map(r => ({ label: r.month_label, spentPaise: Number(r.total_spent) }));

  // Call calculateHealthScore
  const { calculateHealthScore } = await import('@/lib/analytics/healthScore');
  const healthData = calculateHealthScore({ monthlyIncomePaise, totalSpentPaise, budgets, goals });

  return {
    totalSpentPaise,
    totalIncomePaise: monthlyIncomePaise,
    savingsPaise,
    savingsRate,
    monthlyGrowthPct,
    budgetCompliancePct,
    healthScore: healthData.score,
    healthStatus: healthData.status,
    topCategories,
    recentExpenses,
    goals,
    recentInsights: insightsBundle.insights.slice(0, 5),
    monthlyTrend,
    alerts
  };
}

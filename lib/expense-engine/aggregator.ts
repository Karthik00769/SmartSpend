/**
 * lib/expense-engine/aggregator.ts
 * ─────────────────────────────────────────────────────────────────────
 * Pure aggregation functions.
 * Takes raw ExpenseDTO arrays and produces structured summaries.
 *
 * Deliberately NO database calls — all aggregation is done in TypeScript
 * over already-fetched data. This keeps the functions fast, testable,
 * and composable without additional round-trips.
 */

import type {
  MonthlySummary,
  WeeklySummary,
  DailySummary,
  CategorySummary,
} from './types';
import { getISOWeek, getWeekStart } from './validator';
import { getCategoryMeta } from './categorizer';
import type { ExpenseDTO } from '@/types/api';

// ─── Month labels ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Monthly summary ──────────────────────────────────────────────────────────

/**
 * buildMonthlySummary
 * Given a flat list of expenses for ONE month and the user's monthly income,
 * returns the MonthlySummary object for that period.
 */
export function buildMonthlySummary(
  expenses:      ExpenseDTO[],
  year:          number,
  month:         number,
  monthlyIncome: number,
): MonthlySummary {
  if (expenses.length === 0) {
    return {
      year, month,
      label:            `${MONTH_NAMES[month]} ${year}`,
      totalSpent:       0,
      transactionCount: 0,
      dailyAvg:         0,
      income:           monthlyIncome,
      savings:          monthlyIncome,
      savingsRate:      100,
      topCategory:      '—',
      topCategorySpend: 0,
    };
  }

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  // Days in the month for daily average calculation
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyAvg    = totalSpent / daysInMonth;
  const savings     = Math.max(0, monthlyIncome - totalSpent);
  const savingsRate = monthlyIncome > 0
    ? Math.round((savings / monthlyIncome) * 100 * 10) / 10
    : 0;

  // Find top spending category
  const catTotals = new Map<string, number>();
  for (const e of expenses) {
    catTotals.set(e.categoryName, (catTotals.get(e.categoryName) ?? 0) + e.amount);
  }
  const [topCategory, topCategorySpend] = [...catTotals.entries()].reduce(
    (best, cur) => (cur[1] > best[1] ? cur : best),
    ['—', 0],
  );

  return {
    year, month,
    label:            `${MONTH_NAMES[month]} ${year}`,
    totalSpent:       Math.round(totalSpent * 100) / 100,
    transactionCount: expenses.length,
    dailyAvg:         Math.round(dailyAvg * 100) / 100,
    income:           monthlyIncome,
    savings:          Math.round(savings * 100) / 100,
    savingsRate,
    topCategory,
    topCategorySpend: Math.round(topCategorySpend * 100) / 100,
  };
}

// ─── Weekly summary ───────────────────────────────────────────────────────────

/**
 * buildWeeklySummaries
 * Groups expenses by ISO week and builds a WeeklySummary per week.
 * Includes a daily breakdown within each week.
 */
export function buildWeeklySummaries(expenses: ExpenseDTO[]): WeeklySummary[] {
  if (expenses.length === 0) return [];

  // Group by week key "YYYY-WW"
  const byWeek = new Map<string, ExpenseDTO[]>();
  for (const e of expenses) {
    const d   = new Date(e.date + 'T00:00:00Z');
    const wk  = getISOWeek(d);
    const yr  = d.getUTCFullYear();
    const key = `${yr}-${String(wk).padStart(2, '0')}`;
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(e);
  }

  const summaries: WeeklySummary[] = [];

  for (const [key, weekExpenses] of [...byWeek.entries()].sort()) {
    const [yr, wk] = key.split('-').map(Number);
    const firstDate = new Date(weekExpenses[0].date + 'T00:00:00Z');
    const weekStart = getWeekStart(firstDate);
    const weekEnd   = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    const totalSpent = weekExpenses.reduce((s, e) => s + e.amount, 0);
    const txCount    = weekExpenses.length;

    // Build daily breakdown for the 7 days of this week
    const byDay = new Map<string, ExpenseDTO[]>();
    for (const e of weekExpenses) {
      if (!byDay.has(e.date)) byDay.set(e.date, []);
      byDay.get(e.date)!.push(e);
    }

    const dailyBreakdown: DailySummary[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayExpenses]) => {
        const d = new Date(date + 'T00:00:00Z');
        return {
          date,
          dayLabel:   SHORT_DAY[d.getUTCDay()],
          totalSpent: Math.round(dayExpenses.reduce((s, e) => s + e.amount, 0) * 100) / 100,
          txCount:    dayExpenses.length,
        };
      });

    summaries.push({
      weekNumber: wk,
      weekLabel:  `Week ${wk}, ${yr}`,
      startDate:  weekStart.toISOString().slice(0, 10),
      endDate:    weekEnd.toISOString().slice(0, 10),
      totalSpent: Math.round(totalSpent * 100) / 100,
      txCount,
      dailyAvg:   Math.round((totalSpent / 7) * 100) / 100,
      byDay:      dailyBreakdown,
    });
  }

  return summaries;
}

// ─── Category summary ─────────────────────────────────────────────────────────

/**
 * buildCategorySummaries
 * Groups expenses by category and computes totals, percentages, and budget usage.
 */
export function buildCategorySummaries(
  expenses:      ExpenseDTO[],
  budgetMap:     Map<number, number>,  // categoryId → limit_amount (0 = no budget)
): CategorySummary[] {
  if (expenses.length === 0) return [];

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  // Group by categoryId
  const byCategory = new Map<number, ExpenseDTO[]>();
  for (const e of expenses) {
    if (!byCategory.has(e.categoryId)) byCategory.set(e.categoryId, []);
    byCategory.get(e.categoryId)!.push(e);
  }

  const summaries: CategorySummary[] = [];

  for (const [categoryId, catExpenses] of byCategory.entries()) {
    const catTotal  = catExpenses.reduce((s, e) => s + e.amount, 0);
    const txCount   = catExpenses.length;
    const avgAmount = catTotal / txCount;
    const pctOfTotal = totalSpent > 0 ? (catTotal / totalSpent) * 100 : 0;
    const budgetLimit = budgetMap.get(categoryId) ?? 0;
    const budgetUsed  = budgetLimit > 0 ? (catTotal / budgetLimit) * 100 : 0;
    const meta        = getCategoryMeta(categoryId);

    summaries.push({
      categoryId,
      name:        meta.name,
      icon:        meta.icon,
      color:       meta.color,
      totalSpent:  Math.round(catTotal * 100) / 100,
      txCount,
      avgAmount:   Math.round(avgAmount * 100) / 100,
      pctOfTotal:  Math.round(pctOfTotal * 10) / 10,
      budgetLimit,
      budgetUsed:  Math.round(budgetUsed * 10) / 10,
      isOverBudget: budgetLimit > 0 && catTotal > budgetLimit,
    });
  }

  // Sorted: highest spend first
  return summaries.sort((a, b) => b.totalSpent - a.totalSpent);
}

// ─── Multi-month trend ────────────────────────────────────────────────────────

/**
 * buildMonthlyTrend
 * Builds a month-by-month trend array from a multi-month expense array.
 * Used by AreaChart / LineChart on the reports page.
 */
export function buildMonthlyTrend(
  expensesByMonth: { year: number; month: number; expenses: ExpenseDTO[] }[],
  monthlyIncome:   number,
): { label: string; income: number; expenses: number; savings: number }[] {
  return expensesByMonth.map(({ year, month, expenses }) => {
    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
    return {
      label:    `${MONTH_NAMES[month].slice(0, 3)} ${year}`,
      income:   monthlyIncome,
      expenses: Math.round(totalSpent * 100) / 100,
      savings:  Math.round(Math.max(0, monthlyIncome - totalSpent) * 100) / 100,
    };
  });
}

// ─── Day-of-week heatmap ──────────────────────────────────────────────────────

/**
 * buildDayOfWeekStats
 * Aggregates spending across Mon-Sun for heatmap / bar chart.
 */
export function buildDayOfWeekStats(
  expenses: ExpenseDTO[],
): { day: string; total: number; count: number; avg: number }[] {
  const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const map = new Map<string, { total: number; count: number }>(
    DAY_ORDER.map(d => [d, { total: 0, count: 0 }]),
  );

  for (const e of expenses) {
    const d   = new Date(e.date + 'T00:00:00Z');
    const key = SHORT_DAY[d.getUTCDay()] === 'Sun' ? 'Sun' : SHORT_DAY[d.getUTCDay()];
    const slot = map.get(key)!;
    slot.total += e.amount;
    slot.count += 1;
  }

  return DAY_ORDER.map(day => {
    const { total, count } = map.get(day)!;
    return {
      day,
      total: Math.round(total * 100) / 100,
      count,
      avg:   count > 0 ? Math.round((total / count) * 100) / 100 : 0,
    };
  });
}

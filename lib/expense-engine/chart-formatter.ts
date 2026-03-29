/**
 * lib/expense-engine/chart-formatter.ts
 * ─────────────────────────────────────────────────────────────────────
 * Converts engine summaries into Recharts-ready data structures.
 *
 * Each function returns an array shaped for a specific Recharts component.
 * All output is serializable (no Date objects, no undefined).
 *
 * Recharts component → function mapping:
 *  <PieChart>    → toPieChart()
 *  <BarChart>    → toCategoryBar(), toWeeklyBar(), toDailyBar()
 *  <AreaChart>   → toMonthlyTrend()
 *  <BarChart>    → toDayOfWeekBar()
 *  All-in-one    → buildChartBundle()
 */

import type {
  CategorySummary,
  MonthlySummary,
  WeeklySummary,
  PieDataPoint,
  BarDataPoint,
  TrendDataPoint,
  DayOfWeekDataPoint,
  ChartBundle,
} from './types';

// ─── Color palette fallback ───────────────────────────────────────────────────
// Used when a category doesn't carry a color (shouldn't happen in practice)

const FALLBACK_COLORS = [
  '#6366F1', '#F97316', '#22C55E', '#EF4444',
  '#A855F7', '#EC4899', '#EAB308', '#0891B2', '#6B7280',
];

// ─── 1. Pie chart (category breakdown) ───────────────────────────────────────

/**
 * toPieChart
 * Shapes CategorySummary[] into PieDataPoint[] for <PieChart>.
 * Rounds percentages so they sum to 100.
 *
 * @param topN - Only include the top N categories; remainder merged into "Other"
 */
export function toPieChart(
  categories: CategorySummary[],
  topN: number = 6,
): PieDataPoint[] {
  if (categories.length === 0) return [];

  const sorted  = [...categories].sort((a, b) => b.totalSpent - a.totalSpent);
  const top     = sorted.slice(0, topN);
  const rest    = sorted.slice(topN);

  const points: PieDataPoint[] = top.map((c, i) => ({
    name:  c.name,
    value: c.totalSpent,
    fill:  c.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    icon:  c.icon,
    pct:   c.pctOfTotal,
  }));

  // Merge remaining categories into "Other"
  if (rest.length > 0) {
    const otherTotal = rest.reduce((s, c) => s + c.totalSpent, 0);
    const otherPct   = rest.reduce((s, c) => s + c.pctOfTotal, 0);
    points.push({
      name:  'Other',
      value: Math.round(otherTotal * 100) / 100,
      fill:  '#6B7280',
      icon:  '📌',
      pct:   Math.round(otherPct * 10) / 10,
    });
  }

  return points;
}

// ─── 2. Category bar chart ────────────────────────────────────────────────────

/**
 * toCategoryBar
 * Shapes CategorySummary[] into BarDataPoint[] for a vertical <BarChart>.
 * Adds budget limit as a reference line value.
 *
 * Suitable for: "Spending by Category" bar chart with optional budget overlay.
 */
export function toCategoryBar(categories: CategorySummary[]): BarDataPoint[] {
  return categories.map((c, i) => ({
    name:        c.name,
    value:       c.totalSpent,
    budget:      c.budgetLimit > 0 ? c.budgetLimit : undefined,
    fill:        c.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    icon:        c.icon,
    count:       c.txCount,
    pct:         c.pctOfTotal,
    isOverBudget: c.isOverBudget ? 1 : 0,
  }));
}

// ─── 3. Monthly trend (Income vs Expenses vs Savings) ────────────────────────

/**
 * toMonthlyTrend
 * Shapes an array of period totals into TrendDataPoint[] for <AreaChart> or <LineChart>.
 *
 * Input comes from buildMonthlyTrend() in aggregator.ts.
 */
export function toMonthlyTrend(
  trend: { label: string; income: number; expenses: number; savings: number }[],
): TrendDataPoint[] {
  return trend.map(t => ({
    label:    t.label,
    income:   t.income,
    expenses: t.expenses,
    savings:  t.savings,
  }));
}

// ─── 4. Weekly bar chart ──────────────────────────────────────────────────────

/**
 * toWeeklyBar
 * Converts WeeklySummary[] into BarDataPoint[] for a <BarChart> of weekly totals.
 * Shows one bar per week in the selected date range.
 */
export function toWeeklyBar(weeks: WeeklySummary[]): BarDataPoint[] {
  return weeks.map((w, i) => ({
    name:  w.weekLabel,
    value: w.totalSpent,
    count: w.txCount,
    avg:   w.dailyAvg,
    fill:  FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));
}

// ─── 5. Daily bar chart (current month) ──────────────────────────────────────

/**
 * toDailyBar
 * Builds a 31-slot BarDataPoint[] for the current month.
 * Slots with no spending have value: 0.
 * Suitable for a sparkline or mini <BarChart>.
 */
export function toDailyBar(
  expenses: { date: string; amount: number }[],
  year:     number,
  month:    number,
): BarDataPoint[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const totals      = new Map<number, number>();

  for (const e of expenses) {
    const day = parseInt(e.date.split('-')[2], 10);
    totals.set(day, (totals.get(day) ?? 0) + e.amount);
  }

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day   = i + 1;
    const value = totals.get(day) ?? 0;
    return {
      name:  String(day),
      value: Math.round(value * 100) / 100,
      fill:  value > 0 ? '#16a34a' : '#E5E7EB',
    };
  });
}

// ─── 6. Day-of-week bar chart ─────────────────────────────────────────────────

/**
 * toDayOfWeekBar
 * Converts day-of-week stats into DayOfWeekDataPoint[] for a heatmap <BarChart>.
 */
export function toDayOfWeekBar(
  stats: { day: string; total: number; count: number; avg: number }[],
): DayOfWeekDataPoint[] {
  // Assign a colour that scales with the total (traffic-light style)
  const maxTotal = Math.max(...stats.map(s => s.total), 1);
  return stats.map(s => ({
    day:   s.day,
    total: s.total,
    count: s.count,
    avg:   s.avg,
    fill:  getFillForHeatmap(s.total / maxTotal),
  }));
}

/** Returns a green→red gradient colour based on 0-1 intensity */
function getFillForHeatmap(intensity: number): string {
  if (intensity >= 0.75) return '#EF4444'; // red   — high spend
  if (intensity >= 0.50) return '#F97316'; // orange
  if (intensity >= 0.25) return '#EAB308'; // yellow
  if (intensity > 0)     return '#22C55E'; // green  — low spend
  return '#E5E7EB';                         // grey   — no spend
}

// ─── 7. Consolidated bundle ───────────────────────────────────────────────────

/**
 * buildChartBundle
 * Combines all chart formatters into a single payload.
 * Feed this directly into your dashboard page state.
 */
export function buildChartBundle(params: {
  categories:   CategorySummary[];
  monthlyTrend: { label: string; income: number; expenses: number; savings: number }[];
  weeks:        WeeklySummary[];
  dailyExpenses: { date: string; amount: number }[];
  dayOfWeekStats: { day: string; total: number; count: number; avg: number }[];
  year:          number;
  month:         number;
}): ChartBundle {
  return {
    pieChart:      toPieChart(params.categories),
    categoryBar:   toCategoryBar(params.categories),
    monthlyTrend:  toMonthlyTrend(params.monthlyTrend),
    weeklyBar:     toWeeklyBar(params.weeks),
    dailySpend:    toDailyBar(params.dailyExpenses, params.year, params.month),
    dayOfWeekHeat: toDayOfWeekBar(params.dayOfWeekStats),
  };
}

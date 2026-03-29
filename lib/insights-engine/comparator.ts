/**
 * lib/insights-engine/comparator.ts
 * ─────────────────────────────────────────────────────────────────────
 * Pure comparison functions.
 * Given two sets of expense data (current vs previous period),
 * produces structured MetricDelta and CategoryTrend objects.
 *
 * 100% pure — no DB calls, no side-effects.
 */

import type {
  MetricDelta,
  TrendDirection,
  CategoryTrend,
  WeekOverWeekResult,
  MonthOverMonthResult,
  WeekPeriod,
  Period,
} from './types';
import type { ExpenseDTO } from '@/types/api';
import type { CategorySummary, MonthlySummary } from '@/lib/expense-engine/types';
import { getCategoryMeta } from '@/lib/expense-engine/categorizer';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Changes below this percentage threshold are considered "stable" */
const SIGNIFICANCE_THRESHOLD = 5;

// ─── Core delta calculator ────────────────────────────────────────────────────

/**
 * calcDelta
 * Computes a MetricDelta between two scalar values.
 * Handles edge cases: zero previous, zero current, infinite growth.
 */
export function calcDelta(current: number, previous: number): MetricDelta {
  const absolute   = current - previous;
  let   percentage = 0;
  let   direction: TrendDirection = 'stable';

  if (previous === 0 && current === 0) {
    direction  = 'stable';
    percentage = 0;
  } else if (previous === 0 && current > 0) {
    direction  = 'new';
    percentage = 100;
  } else {
    percentage = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(percentage) < SIGNIFICANCE_THRESHOLD) direction = 'stable';
    else if (current > previous)                        direction = 'up';
    else                                                direction = 'down';
  }

  return {
    current,
    previous,
    absolute:      Math.round(absolute  * 100) / 100,
    percentage:    Math.round(percentage * 10)  / 10,
    direction,
    isSignificant: Math.abs(percentage) >= SIGNIFICANCE_THRESHOLD,
  };
}

// ─── Category-level comparison ────────────────────────────────────────────────

/**
 * compareCategoryLists
 * Compares two CategorySummary arrays and returns a CategoryTrend per category.
 * Handles new categories (absent in previous) and gone categories.
 */
export function compareCategoryLists(
  current:  CategorySummary[],
  previous: CategorySummary[],
): {
  trends:      CategoryTrend[];
  newCats:     string[];
  goneCats:    string[];
} {
  const prevMap = new Map<number, CategorySummary>(
    previous.map(c => [c.categoryId, c]),
  );
  const currMap = new Map<number, CategorySummary>(
    current.map(c => [c.categoryId, c]),
  );

  const trends: CategoryTrend[] = [];

  // All categories that appear in either period
  const allIds = new Set([...currMap.keys(), ...prevMap.keys()]);

  for (const id of allIds) {
    const curr = currMap.get(id);
    const prev = prevMap.get(id);
    const meta = getCategoryMeta(id);

    const currentSpend  = curr?.totalSpent  ?? 0;
    const previousSpend = prev?.totalSpent  ?? 0;
    const currentRank   = curr ? current.indexOf(curr)  + 1 : 0;
    const previousRank  = prev ? previous.indexOf(prev) + 1 : 0;

    trends.push({
      categoryId:   id,
      categoryName: meta.name,
      icon:         meta.icon,
      color:        meta.color,
      delta:        calcDelta(currentSpend, previousSpend),
      currentRank,
      previousRank,
      rankChange:   currentRank > 0 && previousRank > 0
                      ? currentRank - previousRank
                      : 0,
    });
  }

  // Sort by absolute change descending (biggest movers first)
  trends.sort((a, b) => Math.abs(b.delta.absolute) - Math.abs(a.delta.absolute));

  const newCats  = [...currMap.keys()]
    .filter(id => !prevMap.has(id))
    .map(id => getCategoryMeta(id).name);

  const goneCats = [...prevMap.keys()]
    .filter(id => !currMap.has(id))
    .map(id => getCategoryMeta(id).name);

  return { trends, newCats, goneCats };
}

// ─── Week-over-week comparison ────────────────────────────────────────────────

/**
 * buildWeekOverWeek
 * Compares two weeks of expense data and returns a full WoW result.
 *
 * @param currentExpenses  — expenses belonging to the current ISO week
 * @param previousExpenses — expenses belonging to the previous ISO week
 * @param currentWeek      — metadata for the current week period
 * @param previousWeek     — metadata for the previous week period
 * @param currentCats      — CategorySummary[] for current week
 * @param previousCats     — CategorySummary[] for previous week
 */
export function buildWeekOverWeek(
  currentExpenses:  ExpenseDTO[],
  previousExpenses: ExpenseDTO[],
  currentWeek:      WeekPeriod,
  previousWeek:     WeekPeriod,
  currentCats:      CategorySummary[],
  previousCats:     CategorySummary[],
): WeekOverWeekResult {
  const currTotal = currentExpenses.reduce((s, e) => s + e.amount, 0);
  const prevTotal = previousExpenses.reduce((s, e) => s + e.amount, 0);

  const { trends, newCats, goneCats } = compareCategoryLists(currentCats, previousCats);

  return {
    currentWeek,
    previousWeek,
    totalSpend: calcDelta(currTotal, prevTotal),
    txCount:    calcDelta(currentExpenses.length,  previousExpenses.length),
    dailyAvg:   calcDelta(currTotal / 7,            prevTotal / 7),
    categories: trends,
    newCategories:  newCats,
    goneCategories: goneCats,
  };
}

// ─── Month-over-month comparison ──────────────────────────────────────────────

/**
 * buildMonthOverMonth
 * Compares two MonthlySummary objects and CategorySummary arrays.
 */
export function buildMonthOverMonth(
  currentSummary:  MonthlySummary,
  previousSummary: MonthlySummary,
  currentCats:     CategorySummary[],
  previousCats:    CategorySummary[],
  currentPeriod:   Period,
  previousPeriod:  Period,
): MonthOverMonthResult {
  const { trends } = compareCategoryLists(currentCats, previousCats);

  return {
    currentMonth:  currentPeriod,
    previousMonth: previousPeriod,
    totalSpend:  calcDelta(currentSummary.totalSpent,  previousSummary.totalSpent),
    txCount:     calcDelta(currentSummary.transactionCount, previousSummary.transactionCount),
    dailyAvg:    calcDelta(currentSummary.dailyAvg,    previousSummary.dailyAvg),
    savings:     calcDelta(currentSummary.savings,     previousSummary.savings),
    savingsRate: calcDelta(currentSummary.savingsRate, previousSummary.savingsRate),
    categories:  trends,
  };
}

// ─── Percentage formatter ─────────────────────────────────────────────────────

/** Format a percentage as "+12.5%", "-7%", "~0%" */
export function formatDelta(delta: MetricDelta): string {
  if (delta.direction === 'stable') return '~0%';
  if (delta.direction === 'new')    return '+100% (new)';
  const sign = delta.percentage > 0 ? '+' : '';
  return `${sign}${delta.percentage}%`;
}

/** Return a human-readable direction phrase */
export function directionPhrase(delta: MetricDelta): string {
  switch (delta.direction) {
    case 'up':     return `increased ${Math.abs(delta.percentage)}%`;
    case 'down':   return `decreased ${Math.abs(delta.percentage)}%`;
    case 'new':    return `appeared for the first time`;
    case 'stable': return `stayed roughly the same`;
  }
}

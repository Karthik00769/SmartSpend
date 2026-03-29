/**
 * lib/insights-engine/index.ts
 * ─────────────────────────────────────────────────────────────────────
 * Public API for the SmartSpend Insights Engine.
 *
 * Single entry point: runInsightsEngine(userId, year, month)
 *
 * Pipeline:
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │ 1.  Fetch data (expenses × 3 months, goals, budgets)        │
 *  │     All parallel — single round of DB calls.                │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ 2.  Aggregate (expense engine: summaries + categories)      │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ 3.  Compare (comparator: WoW + MoM deltas)                  │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ 4.  Detect patterns (pattern-detector)                      │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ 5.  Analyse goals (goal-analyzer: probability + milestones) │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ 6.  Score (scorer: 4 sub-scores + overall)                  │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │ 7.  Generate advice (text-generator: TextAdvice[])          │
 *  └─────────────────────────────────────────────────────────────┘
 */

import { listExpenses } from '@/services/expense.service';
import { listBudgets }  from '@/services/budget.service';
import { listGoals }    from '@/services/goal.service';
import { query }        from '@/lib/db';

import {
  buildMonthlySummary,
  buildWeeklySummaries,
  buildCategorySummaries,
} from '@/lib/expense-engine/aggregator';
import { getISOWeek, getWeekStart } from '@/lib/expense-engine/validator';

import { buildWeekOverWeek, buildMonthOverMonth }  from './comparator';
import { detectPatterns }                          from './pattern-detector';
import { analyzeAllGoals, computeAvgDailySavings } from './goal-analyzer';
import { computeHealthScore }                       from './scorer';
import {
  generateWeekAdvice,
  generateMonthAdvice,
  generateGoalAdvice,
  generateBudgetAlerts,
  generatePatternTips,
  generateScoreCard,
  generateForecastAlerts,
} from './text-generator';
import { calculateBudgetForecasts } from './forecaster';

import type { InsightsEngineOutput, WeekPeriod, Period } from './types';
import type { ExpenseDTO } from '@/types/api';

// ─── DB shape helpers ─────────────────────────────────────────────────────────

interface UserRow { monthly_income: string }

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * runInsightsEngine
 * Fetches all required data and runs the full 7-step insights pipeline.
 * Returns a complete InsightsEngineOutput JSON.
 */
export async function runInsightsEngine(
  userId: string,
  year:   number,
  month:  number,
): Promise<InsightsEngineOutput> {

  // ── Step 1: Parallel data fetch ───────────────────────────────────────────
  const prevMonth        = getPrevMonth(year, month);
  const prevPrevMonth    = getPrevMonth(prevMonth.year, prevMonth.month);

  const [
    currentExpenses,
    prevExpenses,
    prevPrevExpenses,
    budgetSummary,
    goals,
    userRows,
  ] = await Promise.all([
    listExpenses({ userId, year, month, limit: 500 }),
    listExpenses({ userId, year: prevMonth.year, month: prevMonth.month, limit: 500 }),
    listExpenses({ userId, year: prevPrevMonth.year, month: prevPrevMonth.month, limit: 500 }),
    listBudgets({ userId, year, month }),
    listGoals({ userId, status: 'active' }),
    query<UserRow[]>(`SELECT monthly_income FROM users WHERE id = ? LIMIT 1`, [userId]),
  ]);

  const monthlyIncome = parseFloat(userRows[0]?.monthly_income ?? '0');
  const dailyBudget   = monthlyIncome > 0 ? monthlyIncome / 30 : 0;

  // ── Step 2: Summaries + category data ────────────────────────────────────
  const budgetMap = new Map<number, number>(
    budgetSummary.categories.map(c => [c.categoryId, c.allocated]),
  );

  const [currentSummary, prevSummary] = [
    buildMonthlySummary(currentExpenses, year, month, monthlyIncome),
    buildMonthlySummary(prevExpenses, prevMonth.year, prevMonth.month, monthlyIncome),
  ];

  const [currentCats, prevCats] = [
    buildCategorySummaries(currentExpenses, budgetMap),
    buildCategorySummaries(prevExpenses, new Map()),
  ];

  // ── Step 3: Week-over-week ────────────────────────────────────────────────
  const wowResult = buildWeekOverWeekData(currentExpenses, prevExpenses, budgetMap, year, month);

  // ── Month-over-month ──────────────────────────────────────────────────────
  const currentPeriod:  Period = { year, month };
  const previousPeriod: Period = { year: prevMonth.year, month: prevMonth.month };

  const momResult = buildMonthOverMonth(
    currentSummary, prevSummary,
    currentCats,    prevCats,
    currentPeriod,  previousPeriod,
  );

  // ── Step 4: Pattern detection ─────────────────────────────────────────────
  const allExpenses = [...currentExpenses, ...prevExpenses, ...prevPrevExpenses];
  const pattern     = detectPatterns(allExpenses, dailyBudget);

  // ── Step 5: Goal probability ──────────────────────────────────────────────
  const threeMonths = [
    { income: monthlyIncome, totalSpent: prevPrevSummaryTotal(prevPrevExpenses), daysInMonth: 30 },
    { income: monthlyIncome, totalSpent: prevSummary.totalSpent,   daysInMonth: 30 },
    { income: monthlyIncome, totalSpent: currentSummary.totalSpent, daysInMonth: 30 },
  ];
  const avgDailySavings  = computeAvgDailySavings(threeMonths);
  const goalProbabilities = analyzeAllGoals(goals, avgDailySavings);

  // ── Step 6: Financial health score ────────────────────────────────────────
  const score = computeHealthScore({
    summary:    currentSummary,
    categories: currentCats,
    goals:      goalProbabilities,
    mom:        momResult,
  });

  // ── Step 7: Generate advice ───────────────────────────────────────────────
  const forecasts = calculateBudgetForecasts(currentCats, year, month);
  const advice = [
    generateScoreCard(score),
    ...generateForecastAlerts(forecasts),
    ...(wowResult ? generateWeekAdvice(wowResult) : []),
    ...generateMonthAdvice(momResult, currentSummary),
    ...generateBudgetAlerts(currentCats),
    ...generateGoalAdvice(goalProbabilities),
    ...generatePatternTips(pattern, currentSummary),
  ];

  // Deduplicate by ID (keep first occurrence)
  const seen    = new Set<string>();
  const dedupedAdvice = advice.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  // Sort: critical → warning → positive → info
  const severityOrder = { critical: 0, warning: 1, positive: 2, info: 3 };
  dedupedAdvice.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    generatedAt:       new Date().toISOString(),
    period:            { year, month },
    weekOverWeek:      wowResult,
    monthOverMonth:    momResult,
    goalProbabilities,
    advice:            dedupedAdvice,
    pattern,
    score,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function getPrevMonth(year: number, month: number): Period {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function prevPrevSummaryTotal(expenses: ExpenseDTO[]): number {
  return expenses.reduce((s, e) => s + e.amount, 0);
}

/**
 * Build week-over-week comparison for the most recent two weeks
 * contained in the current and previous months' expense data.
 */
function buildWeekOverWeekData(
  currentExpenses:  ExpenseDTO[],
  prevExpenses:     ExpenseDTO[],
  budgetMap:        Map<number, number>,
  year:             number,
  month:            number,
) {
  const today     = new Date();
  const thisWeek  = getISOWeek(today);
  const weekStart = getWeekStart(today);
  const weekEnd   = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
  const prevWeekEnd = new Date(prevWeekStart);
  prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() + 6);

  const currWeekExpenses = [...currentExpenses, ...prevExpenses].filter(e => {
    return e.date >= weekStart.toISOString().slice(0, 10) &&
           e.date <= weekEnd.toISOString().slice(0, 10);
  });

  const prevWeekExpenses = [...currentExpenses, ...prevExpenses].filter(e => {
    return e.date >= prevWeekStart.toISOString().slice(0, 10) &&
           e.date <= prevWeekEnd.toISOString().slice(0, 10);
  });

  if (currWeekExpenses.length === 0 && prevWeekExpenses.length === 0) return null;

  const currentWeekPeriod: WeekPeriod = {
    year, weekNumber: thisWeek,
    startDate: weekStart.toISOString().slice(0, 10),
    endDate:   weekEnd.toISOString().slice(0, 10),
  };
  const prevWeekPeriod: WeekPeriod = {
    year: prevWeekStart.getUTCFullYear(),
    weekNumber: thisWeek - 1 > 0 ? thisWeek - 1 : 52,
    startDate: prevWeekStart.toISOString().slice(0, 10),
    endDate:   prevWeekEnd.toISOString().slice(0, 10),
  };

  const currCats = buildCategorySummaries(currWeekExpenses, budgetMap);
  const prevCats = buildCategorySummaries(prevWeekExpenses, new Map());

  return buildWeekOverWeek(
    currWeekExpenses, prevWeekExpenses,
    currentWeekPeriod, prevWeekPeriod,
    currCats, prevCats,
  );
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { InsightsEngineOutput } from './types';
export { analyzeGoal, analyzeAllGoals, computeAvgDailySavings } from './goal-analyzer';
export { calcDelta, compareCategoryLists }                       from './comparator';
export { detectPatterns }                                         from './pattern-detector';
export { computeHealthScore }                                     from './scorer';

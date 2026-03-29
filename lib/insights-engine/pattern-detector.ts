/**
 * lib/insights-engine/pattern-detector.ts
 * ─────────────────────────────────────────────────────────────────────
 * Detects behavioural spending patterns from historical expense data.
 *
 * Outputs a SpendingPattern object that feeds both the text generator
 * and the financial health score calculator.
 *
 * Pure module — no DB calls.
 */

import type { SpendingPattern } from './types';
import type { ExpenseDTO } from '@/types/api';

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * detectPatterns
 * Analyses up to 3 months of expense data and returns a SpendingPattern.
 *
 * @param expenses      — flat list of all expenses in the analysis window
 * @param dailyBudget   — optional daily spend cap (income / 30)
 */
export function detectPatterns(
  expenses:    ExpenseDTO[],
  dailyBudget: number = 0,
): SpendingPattern {
  if (expenses.length === 0) {
    return {
      peakDayOfWeek:        '—',
      lowestDayOfWeek:      '—',
      peakWeekOfMonth:      0,
      avgTransactionSize:   0,
      largestTransaction:   0,
      mostFrequentCategory: '—',
      streakDaysUnderBudget: 0,
    };
  }

  // ── Day-of-week totals ────────────────────────────────────────────────────
  const dowTotals = new Map<string, { total: number; count: number }>(
    DAY_ORDER.map(d => [d, { total: 0, count: 0 }]),
  );

  for (const e of expenses) {
    const d   = new Date(e.date + 'T00:00:00Z');
    const day = SHORT_DAY[d.getUTCDay()];
    const key = day === 'Sun' ? 'Sun' : day;
    const slot = dowTotals.get(key)!;
    slot.total += e.amount;
    slot.count += 1;
  }

  // Compute average spend per occurrence for each day (not per date)
  const dowAvg = [...dowTotals.entries()].map(([day, s]) => ({
    day,
    avg: s.count > 0 ? s.total / s.count : 0,
  }));

  const peakDay   = dowAvg.reduce((a, b) => (b.avg > a.avg ? b : a));
  const lowestDay = dowAvg.filter(d => d.avg > 0).reduce(
    (a, b) => (b.avg < a.avg ? b : a),
    { day: '—', avg: Infinity },
  );

  // ── Week-of-month totals (1-4) ────────────────────────────────────────────
  const weekOfMonthTotals: number[] = [0, 0, 0, 0, 0]; // index 0 unused; 1-4 used

  for (const e of expenses) {
    const day  = parseInt(e.date.split('-')[2], 10);
    const week = Math.min(4, Math.ceil(day / 7));
    weekOfMonthTotals[week] += e.amount;
  }

  const peakWeekOfMonth = weekOfMonthTotals.indexOf(
    Math.max(...weekOfMonthTotals.slice(1)),
  );

  // ── Transaction size stats ────────────────────────────────────────────────
  const amounts              = expenses.map(e => e.amount);
  const avgTransactionSize   = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const largestTransaction   = Math.max(...amounts);

  // ── Most frequent category ────────────────────────────────────────────────
  const catCounts = new Map<string, number>();
  for (const e of expenses) {
    catCounts.set(e.categoryName, (catCounts.get(e.categoryName) ?? 0) + 1);
  }
  const mostFrequentCategory = [...catCounts.entries()].reduce(
    (a, b) => (b[1] > a[1] ? b : a),
    ['—', 0],
  )[0];

  // ── Consecutive days under daily budget ──────────────────────────────────
  const streakDaysUnderBudget = dailyBudget > 0
    ? computeStreak(expenses, dailyBudget)
    : 0;

  return {
    peakDayOfWeek:        peakDay.day,
    lowestDayOfWeek:      lowestDay.day,
    peakWeekOfMonth,
    avgTransactionSize:   Math.round(avgTransactionSize * 100) / 100,
    largestTransaction:   Math.round(largestTransaction * 100) / 100,
    mostFrequentCategory,
    streakDaysUnderBudget,
  };
}

// ─── Streak calculation ───────────────────────────────────────────────────────

/**
 * computeStreak
 * Counts how many consecutive days (ending today) the user stayed
 * under their daily budget cap.
 */
function computeStreak(expenses: ExpenseDTO[], dailyBudget: number): number {
  // Group by date
  const byDate = new Map<string, number>();
  for (const e of expenses) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amount);
  }

  // Walk backwards from today
  const today = new Date();
  let streak  = 0;

  for (let i = 0; i < 90; i++) {
    const d    = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key  = d.toISOString().slice(0, 10);
    const spent = byDate.get(key) ?? 0;

    if (spent === 0) {
      // No transaction = under budget for that day
      streak++;
      continue;
    }
    if (spent <= dailyBudget) {
      streak++;
    } else {
      break; // streak broken
    }
  }

  return streak;
}

/**
 * lib/insights-engine/goal-analyzer.ts
 * ─────────────────────────────────────────────────────────────────────
 * Probabilistic savings goal achievement analyzer.
 *
 * Method:
 * 1. Calculate the user's actual historical daily savings rate.
 * 2. Project the goal amount by the target date at the current rate.
 * 3. Compute a probability score (0-100) using a logistic curve
 *    that considers: % complete, days remaining, and daily rate gap.
 * 4. Determine risk tier: on_track / at_risk / behind / completed.
 * 5. Generate milestone dates (25%, 50%, 75%, 100%) at current rate.
 *
 * All calculations are pure — no DB calls.
 */

import type { GoalProbabilityResult, GoalMilestone, GoalRisk } from './types';
import type { GoalDTO } from '@/types/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * logisticScore
 * Maps a ratio (0..∞) to a 0-100 probability using a logistic function.
 * ratio = 1.0 means exactly on track → ~73%.
 * ratio > 1.5 → > 90%. ratio < 0.5 → < 30%.
 */
function logisticScore(ratio: number): number {
  // Logistic: 1 / (1 + e^(-k * (x - 0.5)))
  const k = 5;
  const raw = 1 / (1 + Math.exp(-k * (ratio - 0.75)));
  return Math.round(raw * 100);
}

const MILESTONE_PCTS = [25, 50, 75, 100] as const;
const MILESTONE_LABELS: Record<number, string> = {
  25:  'Quarter way there! 🎯',
  50:  'Halfway milestone! 🌟',
  75:  'Almost there — 75%! 💪',
  100: 'Goal achieved! 🏆',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * analyzeGoal
 * Given a GoalDTO and the user's average monthly income and expenses,
 * returns a GoalProbabilityResult with probability, risk tier, and milestones.
 *
 * @param goal           — The goal to analyze
 * @param avgDailySavings— Historical actual daily savings amount
 *                         (income - expenses) / 30 from last 3 months
 */
export function analyzeGoal(
  goal:            GoalDTO,
  avgDailySavings: number,
): GoalProbabilityResult {
  const today        = new Date();
  const targetDate   = new Date(goal.deadline + 'T00:00:00Z');
  const daysRemaining = Math.max(0, Math.ceil((targetDate.getTime() - today.getTime()) / 86_400_000));
  const remaining    = Math.max(0, goal.targetAmount - goal.currentAmount);

  // Daily required savings to hit target
  const requiredDailyAmount = daysRemaining > 0 ? remaining / daysRemaining : Infinity;

  // Projected total at current rate
  const projectedExtra   = avgDailySavings * daysRemaining;
  const projectedAmount  = Math.min(
    goal.targetAmount,
    goal.currentAmount + projectedExtra,
  );
  const achievementPct   = goal.targetAmount > 0
    ? Math.min(100, (projectedAmount / goal.targetAmount) * 100)
    : 100;

  // Probability score
  const ratio       = requiredDailyAmount > 0 ? avgDailySavings / requiredDailyAmount : 2;
  const probability = daysRemaining === 0
    ? (goal.currentAmount >= goal.targetAmount ? 100 : 0)
    : logisticScore(Math.min(ratio, 3));

  // Risk tier
  let risk: GoalRisk;
  if (goal.currentAmount >= goal.targetAmount)   risk = 'completed';
  else if (probability >= 70)                    risk = 'on_track';
  else if (probability >= 40)                    risk = 'at_risk';
  else                                           risk = 'behind';

  // Weeks to reach target at current rate
  const weeksNeeded = avgDailySavings > 0
    ? Math.ceil(remaining / (avgDailySavings * 7))
    : Infinity;

  // Recommendation text
  const recommendation = buildRecommendation(risk, goal.title, requiredDailyAmount, avgDailySavings, daysRemaining);

  // Milestones
  const milestones = buildMilestones(goal, avgDailySavings, today);

  return {
    goalId:               goal.id,
    title:                goal.title,
    targetAmount:         goal.targetAmount,
    currentAmount:        goal.currentAmount,
    targetDate:           goal.deadline,
    daysRemaining,
    requiredDailyAmount:  Math.round(requiredDailyAmount * 100) / 100,
    actualDailyRate:      Math.round(avgDailySavings * 100) / 100,
    projectedAmount:      Math.round(projectedAmount * 100) / 100,
    achievementPct:       Math.round(achievementPct * 10) / 10,
    probability,
    risk,
    weeksNeeded:          isFinite(weeksNeeded) ? weeksNeeded : -1,
    recommendation,
    milestones,
  };
}

// ─── Batch analysis ───────────────────────────────────────────────────────────

/**
 * analyzeAllGoals
 * Runs analyzeGoal for each active goal.
 * avgDailySavings is computed once and reused across all goals.
 */
export function analyzeAllGoals(
  goals:           GoalDTO[],
  avgDailySavings: number,
): GoalProbabilityResult[] {
  return goals.map(g => analyzeGoal(g, avgDailySavings));
}

// ─── Average daily savings ────────────────────────────────────────────────────

/**
 * computeAvgDailySavings
 * Given N months of (income, totalSpent) data, returns the average daily
 * effective savings rate smoothed over the full period.
 */
export function computeAvgDailySavings(
  months: { income: number; totalSpent: number; daysInMonth: number }[],
): number {
  if (months.length === 0) return 0;
  const totalSaved = months.reduce(
    (s, m) => s + Math.max(0, m.income - m.totalSpent), 0,
  );
  const totalDays = months.reduce((s, m) => s + m.daysInMonth, 0);
  return totalDays > 0 ? totalSaved / totalDays : 0;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildRecommendation(
  risk:         GoalRisk,
  title:        string,
  required:     number,
  actual:       number,
  daysLeft:     number,
): string {
  const $n = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const gap = required - actual;

  switch (risk) {
    case 'completed':
      return `"${title}" is complete! Consider setting a new, more ambitious goal.`;
    case 'on_track':
      return `You're on pace to hit "${title}" on time. Save at least ${$n(required)}/day to stay on track.`;
    case 'at_risk':
      return `"${title}" is at risk. You need ${$n(required)}/day but are saving ${$n(actual)}/day. Boost savings by ${$n(gap)}/day or extend your deadline.`;
    case 'behind':
      return `"${title}" is unlikely at the current pace. You need ${$n(required)}/day (${daysLeft} days left) but saving ${$n(actual)}/day. Consider a revised target or deadline.`;
  }
}

function buildMilestones(
  goal:            GoalDTO,
  avgDailySavings: number,
  today:           Date,
): GoalMilestone[] {
  return MILESTONE_PCTS.map(pct => {
    const targetForMilestone = goal.targetAmount * (pct / 100);
    const alreadyReached     = goal.currentAmount >= targetForMilestone;
    const amountStillNeeded  = Math.max(0, targetForMilestone - goal.currentAmount);
    const daysToMilestone    = avgDailySavings > 0
      ? Math.ceil(amountStillNeeded / avgDailySavings)
      : Infinity;

    const estimatedDate = alreadyReached
      ? toDateStr(today)
      : isFinite(daysToMilestone)
        ? toDateStr(addDays(today, daysToMilestone))
        : '—';

    return {
      pct,
      label:         MILESTONE_LABELS[pct],
      estimatedDate,
      reached:       alreadyReached,
    };
  });
}

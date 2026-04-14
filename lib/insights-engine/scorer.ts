/**
 * lib/insights-engine/scorer.ts
 * ─────────────────────────────────────────────────────────────────────
 * Financial health score calculator.
 *
 * Final score is a weighted average of 4 sub-scores (0-100 each):
 *
 *   Sub-score           Weight  Description
 *   ─────────────────── ─────── ──────────────────────────────────────
 *   Savings Rate         35%    How much of income is saved
 *   Budget Compliance    25%    How well the user sticks to budgets
 *   Goal Progress        25%    Weighted average probability of goals
 *   Spending Control     15%    Transaction size consistency + trend
 *
 * All inputs come from already-computed data structures — no DB calls.
 */

import type { GoalProbabilityResult } from './types';
import type { CategorySummary, MonthlySummary } from '@/lib/expense-engine/types';
import type { MonthOverMonthResult } from './types';

// ─── Sub-score calculators ────────────────────────────────────────────────────

/**
 * savingsRateScore
 * 0%    → 0    (spending more than income)
 * 10%   → 40   (below the 20% recommended floor)
 * 20%   → 70   (at the recommended savings rate)
 * 30%+  → 90+  (excellent)
 */
export function savingsRateScore(savingsRate: number): number {
  if (savingsRate <= 0)  return 0;
  if (savingsRate >= 40) return 100;
  // Linear interpolation with two segments
  if (savingsRate <= 20) return Math.round((savingsRate / 20) * 70);
  return Math.round(70 + ((savingsRate - 20) / 20) * 30);
}

/**
 * budgetComplianceScore
 * Looks at all categories with a budget set.
 * - Category under budget: full credit
 * - Category at 80-100% used: partial credit (warning zone)
 * - Category over budget: 0 credit + penalty
 */
export function budgetComplianceScore(categories: CategorySummary[]): number {
  const budgetedCats = categories.filter(c => c.budgetLimit > 0);
  if (budgetedCats.length === 0) return 0; // default to 0 if no budgets set

  let totalScore = 0;
  for (const cat of budgetedCats) {
    if (!cat.isOverBudget) {
      // Under budget: score based on how far under
      const headroom = 1 - (cat.budgetUsed / 100);
      // Reward usage up to 80% as good (spending budget efficiently)
      // Penalise being way under budget (unused budget → poor planning)
      if (cat.budgetUsed <= 80) totalScore += 100;
      else totalScore += Math.round(100 - (cat.budgetUsed - 80) * 2); // 80-100%: 100 → 60
    } else {
      // Over budget: penalty proportional to how far over
      const overPct = cat.budgetUsed - 100;
      totalScore += Math.max(0, 60 - overPct); // cap penalty at 60 pts deducted
    }
  }

  return Math.round(totalScore / budgetedCats.length);
}

/**
 * goalProgressScore
 * Weighted average of probability scores across all active goals.
 * High-priority goals get 2× weight, medium 1.5×, low 1×.
 */
export function goalProgressScore(goals: GoalProbabilityResult[]): number {
  if (goals.length === 0) return 0; // default to 0 if no goals set

  let weightedSum = 0;
  let totalWeight = 0;

  for (const goal of goals) {
    // We don't have priority in GoalProbabilityResult — use probability directly
    const weight = goal.probability >= 70 ? 2 : goal.probability >= 40 ? 1.5 : 1;
    weightedSum += goal.probability * weight;
    totalWeight += weight;
  }

  return Math.round(weightedSum / totalWeight);
}

/**
 * spendingControlScore
 * Rewards: consistent daily spending, no month-over-month spikes.
 * Penalises: large volatility, spending trend consistently "up".
 */
export function spendingControlScore(
  summary: MonthlySummary,
  mom:     MonthOverMonthResult,
): number {
  let score = 0; // baseline 0 for new users
  
  if (summary.transactionCount === 0) return 0;
  
  score = 80; // set to baseline if data exists

  // Penalise month-over-month spend increase
  if (mom.totalSpend.direction === 'up' && mom.totalSpend.isSignificant) {
    score -= Math.min(30, Math.abs(mom.totalSpend.percentage) / 2);
  }
  // Reward month-over-month decrease
  if (mom.totalSpend.direction === 'down' && mom.totalSpend.isSignificant) {
    score += Math.min(20, Math.abs(mom.totalSpend.percentage) / 2);
  }
  // Penalise zero savings
  if (summary.savings <= 0) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Composite score ──────────────────────────────────────────────────────────

export interface HealthScore {
  overall:          number;
  savingsRate:      number;
  budgetCompliance: number;
  goalProgress:     number;
  spendingControl:  number;
}

/**
 * computeHealthScore
 * Combines the four sub-scores into a weighted overall score.
 */
export function computeHealthScore(params: {
  summary:    MonthlySummary;
  categories: CategorySummary[];
  goals:      GoalProbabilityResult[];
  mom:        MonthOverMonthResult;
}): HealthScore {
  const { summary, categories, goals, mom } = params;

  const srScore  = savingsRateScore(summary.savingsRate);
  const bcScore  = budgetComplianceScore(categories);
  const gpScore  = goalProgressScore(goals);
  const scScore  = spendingControlScore(summary, mom);

  // Weighted composite: 35% + 25% + 25% + 15% = 100%
  const overall = Math.round(
    srScore * 0.35 +
    bcScore * 0.25 +
    gpScore * 0.25 +
    scScore * 0.15,
  );

  return {
    overall:          Math.max(0, Math.min(100, overall)),
    savingsRate:      srScore,
    budgetCompliance: bcScore,
    goalProgress:     gpScore,
    spendingControl:  scScore,
  };
}

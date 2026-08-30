/**
 * lib/finance/calculations/reports.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FinanceCore.Reports — owns ALL reporting and analytics calculations.
 * Integer-safe, Paise-first, deterministic.
 */

/**
 * Round a paise integer value to a clean 2-decimal representation (still integer).
 * Useful for totals that must stay integer after reduce ops.
 */
export function roundPaise(paise: number): number {
  return Math.round(paise);
}

/**
 * Round a percentage to 1 decimal place.
 */
export function roundPct(pct: number): number {
  return Math.round(pct * 10) / 10;
}

/**
 * Round a ratio to 1 decimal place.
 */
export function roundRatio(ratio: number): number {
  return Math.round(ratio * 10) / 10;
}

/**
 * Clamp a value between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Safe percentage of a category within a total.
 * Returns 0 on zero denominator.
 */
export function calculateCategoryPercentage(categoryPaise: number, totalPaise: number): number {
  if (totalPaise <= 0) return 0;
  return roundPct((categoryPaise / totalPaise) * 100);
}

/**
 * Calculate savings from income and spent (Paise).
 * Returns 0 if income <= 0. Never returns negative.
 */
export function calculateSavingsPaise(incomePaise: number, spentPaise: number): number {
  if (incomePaise <= 0) return 0;
  return Math.max(0, incomePaise - spentPaise);
}

/**
 * Calculate savings rate as a percentage.
 * Returns 0 if income <= 0.
 */
export function calculateSavingsRate(incomePaise: number, spentPaise: number): number {
  if (incomePaise <= 0) return 0;
  const savings = Math.max(0, incomePaise - spentPaise);
  return roundPct((savings / incomePaise) * 100);
}

/**
 * Calculate expense growth percentage between two periods.
 */
export function calculateExpenseGrowthPct(currentPaise: number, previousPaise: number): number {
  if (previousPaise <= 0) return 0;
  return roundPct(((currentPaise - previousPaise) / previousPaise) * 100);
}

/**
 * Calculate average spend from a total and a count.
 */
export function calculateAverageSpend(totalPaise: number, count: number): number {
  if (count <= 0) return 0;
  return roundPaise(totalPaise / count);
}

/**
 * Calculate daily average spend from a monthly total.
 */
export function calculateDailyAverage(totalPaise: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0;
  return roundPaise(totalPaise / daysInMonth);
}

/**
 * Classify savings rate into a human-readable tier.
 */
export function classifySavingsRate(savingsRatePct: number): 'low' | 'moderate' | 'good' {
  if (savingsRatePct < 10) return 'low';
  if (savingsRatePct <= 30) return 'moderate';
  return 'good';
}

/**
 * Determine spending trend direction.
 */
export function determineTrendDirection(currentPaise: number, previousPaise: number): 'up' | 'down' | 'stable' {
  const pct = calculateExpenseGrowthPct(currentPaise, previousPaise);
  if (Math.abs(pct) < 1) return 'stable';
  return currentPaise > previousPaise ? 'up' : 'down';
}

/**
 * Calculate monthly comparison: returns growth pct and direction.
 */
export function calculateMonthlyComparison(
  currentPaise: number,
  previousPaise: number,
): { growthPct: number; direction: 'up' | 'down' | 'stable' } {
  return {
    growthPct:  calculateExpenseGrowthPct(currentPaise, previousPaise),
    direction:  determineTrendDirection(currentPaise, previousPaise),
  };
}

/**
 * Calculate anomaly spike ratio: current spend vs two-month average.
 */
export function calculateSpikeRatio(currentPaise: number, avgPrevPaise: number): number {
  if (avgPrevPaise <= 0) return 0;
  return roundRatio(currentPaise / avgPrevPaise);
}

/**
 * Calculate the two-month average for anomaly detection.
 * Ignores periods with 0 spend (not counted in divisor).
 */
export function calculateTwoMonthAverage(prev1Paise: number, prev2Paise: number): number {
  const divisor = (prev1Paise > 0 ? 1 : 0) + (prev2Paise > 0 ? 1 : 0);
  if (divisor === 0) return 0;
  return roundPaise((prev1Paise + prev2Paise) / divisor);
}

/**
 * Clamp a health score to [0, 100] and round.
 */
export function finalizeHealthScore(rawScore: number): number {
  return clamp(Math.round(rawScore), 0, 100);
}

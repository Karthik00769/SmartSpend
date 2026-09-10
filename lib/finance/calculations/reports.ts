/**
 * lib/finance/calculations/reports.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FinanceCore.Reports — owns ALL reporting and analytics calculations.
 * Integer-safe, Minor-first, deterministic.
 */

/**
 * Round a minor integer value to a clean 2-decimal representation (still integer).
 * Useful for totals that must stay integer after reduce ops.
 */
export function roundMinor(minor: number): number {
  return Math.round(minor);
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
export function calculateCategoryPercentage(categoryMinor: number, totalMinor: number): number {
  if (totalMinor <= 0) return 0;
  return roundPct((categoryMinor / totalMinor) * 100);
}

/**
 * Calculate savings from income and spent (Minor).
 * Returns 0 if income <= 0. Never returns negative.
 */
export function calculateSavingsMinor(incomeMinor: number, spentMinor: number): number {
  if (incomeMinor <= 0) return 0;
  return Math.max(0, incomeMinor - spentMinor);
}

/**
 * Calculate savings rate as a percentage.
 * Returns 0 if income <= 0.
 */
export function calculateSavingsRate(incomeMinor: number, spentMinor: number): number {
  if (incomeMinor <= 0) return 0;
  const savings = Math.max(0, incomeMinor - spentMinor);
  return roundPct((savings / incomeMinor) * 100);
}

/**
 * Calculate expense growth percentage between two periods.
 */
export function calculateExpenseGrowthPct(currentMinor: number, previousMinor: number): number {
  if (previousMinor <= 0) return 0;
  return roundPct(((currentMinor - previousMinor) / previousMinor) * 100);
}

/**
 * Calculate average spend from a total and a count.
 */
export function calculateAverageSpend(totalMinor: number, count: number): number {
  if (count <= 0) return 0;
  return roundMinor(totalMinor / count);
}

/**
 * Calculate daily average spend from a monthly total.
 */
export function calculateDailyAverage(totalMinor: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0;
  return roundMinor(totalMinor / daysInMonth);
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
export function determineTrendDirection(currentMinor: number, previousMinor: number): 'up' | 'down' | 'stable' {
  const pct = calculateExpenseGrowthPct(currentMinor, previousMinor);
  if (Math.abs(pct) < 1) return 'stable';
  return currentMinor > previousMinor ? 'up' : 'down';
}

/**
 * Calculate monthly comparison: returns growth pct and direction.
 */
export function calculateMonthlyComparison(
  currentMinor: number,
  previousMinor: number,
): { growthPct: number; direction: 'up' | 'down' | 'stable' } {
  return {
    growthPct:  calculateExpenseGrowthPct(currentMinor, previousMinor),
    direction:  determineTrendDirection(currentMinor, previousMinor),
  };
}

/**
 * Calculate anomaly spike ratio: current spend vs two-month average.
 */
export function calculateSpikeRatio(currentMinor: number, avgPrevMinor: number): number {
  if (avgPrevMinor <= 0) return 0;
  return roundRatio(currentMinor / avgPrevMinor);
}

/**
 * Calculate the two-month average for anomaly detection.
 * Ignores periods with 0 spend (not counted in divisor).
 */
export function calculateTwoMonthAverage(prev1Minor: number, prev2Minor: number): number {
  const divisor = (prev1Minor > 0 ? 1 : 0) + (prev2Minor > 0 ? 1 : 0);
  if (divisor === 0) return 0;
  return roundMinor((prev1Minor + prev2Minor) / divisor);
}

/**
 * Clamp a health score to [0, 100] and round.
 */
export function finalizeHealthScore(rawScore: number): number {
  return clamp(Math.round(rawScore), 0, 100);
}

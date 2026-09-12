/**
 * lib/finance/calculations/core.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single Source of Truth for all financial mathematical formulas.
 * All reports, dashboards, health scores, insights, and goal logic MUST use this.
 */

export function calculateSavings(incomeMinor: number, spentMinor: number): number {
  if (incomeMinor <= 0) return 0;
  return Math.max(0, incomeMinor - spentMinor);
}

export function calculateSavingsRate(incomeMinor: number, spentMinor: number): number {
  if (incomeMinor <= 0) return 0;
  const savings = calculateSavings(incomeMinor, spentMinor);
  return Math.round((savings / incomeMinor) * 100);
}

export function calculateGrowthPct(currentMinor: number, previousMinor: number): number {
  if (previousMinor <= 0) return 0;
  return Math.round(((currentMinor - previousMinor) / previousMinor) * 100);
}

export function calculateAverageSpend(totalMinor: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round(totalMinor / count);
}

export function calculateCategoryPercentage(categoryMinor: number, totalMinor: number): number {
  if (totalMinor <= 0) return 0;
  return Math.round((categoryMinor / totalMinor) * 100);
}

export function calculateBudgetUsage(spentMinor: number, allocatedMinor: number): number {
  if (allocatedMinor <= 0) return 0;
  return Math.round((spentMinor / allocatedMinor) * 100);
}

// ─── Goal Formulas ─────────────────────────────────────────────────────────

export function calculateGoalProgress(savedMinor: number, targetMinor: number): number {
  if (targetMinor <= 0) return savedMinor > 0 ? 100 : 0;
  return (savedMinor / targetMinor) * 100;
}

export function calculateGoalRemaining(savedMinor: number, targetMinor: number): number {
  return Math.max(0, targetMinor - savedMinor);
}

export function isGoalCompleted(savedMinor: number, targetMinor: number): boolean {
  return savedMinor >= targetMinor;
}

export function calculateGoalStatus(
  savedMinor: number,
  targetMinor: number,
  targetDateISO: string
): 'on_track' | 'overdue' | 'completed' {
  if (savedMinor >= targetMinor) {
    return 'completed';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(targetDateISO);
  targetDate.setHours(0, 0, 0, 0);

  if (targetDate < today) {
    return 'overdue';
  }

  return 'on_track';
}

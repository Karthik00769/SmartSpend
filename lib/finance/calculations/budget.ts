export type BudgetStatus = 'safe' | 'warning' | 'exceeded';

/**
 * Calculates budget progress as a percentage.
 * Returns 0 if allocated is 0.
 */
export function calculateBudgetProgress(spentMinor: number, allocatedMinor: number): number {
  if (allocatedMinor === 0) return 0;
  return (spentMinor / allocatedMinor) * 100;
}

/**
 * Calculates the remaining budget.
 * Returns 0 if allocated is 0 or if overspent.
 */
export function calculateRemainingBudget(spentMinor: number, allocatedMinor: number): number {
  if (allocatedMinor === 0) return 0;
  return Math.max(0, allocatedMinor - spentMinor);
}

/**
 * Calculates the overspent amount.
 */
export function calculateOverspent(spentMinor: number, allocatedMinor: number): number {
  if (allocatedMinor === 0) return spentMinor;
  return Math.max(0, spentMinor - allocatedMinor);
}

/**
 * Checks if the budget is exceeded.
 */
export function isBudgetExceeded(spentMinor: number, allocatedMinor: number): boolean {
  if (allocatedMinor === 0) return false;
  return spentMinor >= allocatedMinor;
}

/**
 * Determines if a budget alert is needed (80% threshold).
 */
export function needsBudgetAlert(spentMinor: number, allocatedMinor: number): boolean {
  if (allocatedMinor === 0) return false;
  const progress = calculateBudgetProgress(spentMinor, allocatedMinor);
  return progress >= 80;
}

/**
 * Determines the overall budget status.
 */
export function calculateBudgetStatus(spentMinor: number, allocatedMinor: number): BudgetStatus {
  if (allocatedMinor === 0) return 'safe';
  const progress = calculateBudgetProgress(spentMinor, allocatedMinor);
  
  if (progress >= 100) return 'exceeded';
  if (progress >= 80) return 'warning';
  return 'safe';
}

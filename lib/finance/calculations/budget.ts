export type BudgetStatus = 'safe' | 'warning' | 'exceeded';

/**
 * Calculates budget progress as a percentage.
 * Returns 0 if allocated is 0.
 */
export function calculateBudgetProgress(spentPaise: number, allocatedPaise: number): number {
  if (allocatedPaise === 0) return 0;
  return (spentPaise / allocatedPaise) * 100;
}

/**
 * Calculates the remaining budget.
 * Returns 0 if allocated is 0 or if overspent.
 */
export function calculateRemainingBudget(spentPaise: number, allocatedPaise: number): number {
  if (allocatedPaise === 0) return 0;
  return Math.max(0, allocatedPaise - spentPaise);
}

/**
 * Calculates the overspent amount.
 */
export function calculateOverspent(spentPaise: number, allocatedPaise: number): number {
  if (allocatedPaise === 0) return spentPaise;
  return Math.max(0, spentPaise - allocatedPaise);
}

/**
 * Checks if the budget is exceeded.
 */
export function isBudgetExceeded(spentPaise: number, allocatedPaise: number): boolean {
  if (allocatedPaise === 0) return false;
  return spentPaise >= allocatedPaise;
}

/**
 * Determines if a budget alert is needed (80% threshold).
 */
export function needsBudgetAlert(spentPaise: number, allocatedPaise: number): boolean {
  if (allocatedPaise === 0) return false;
  const progress = calculateBudgetProgress(spentPaise, allocatedPaise);
  return progress >= 80;
}

/**
 * Determines the overall budget status.
 */
export function calculateBudgetStatus(spentPaise: number, allocatedPaise: number): BudgetStatus {
  if (allocatedPaise === 0) return 'safe';
  const progress = calculateBudgetProgress(spentPaise, allocatedPaise);
  
  if (progress >= 100) return 'exceeded';
  if (progress >= 80) return 'warning';
  return 'safe';
}

/**
 * lib/finance/calculations/analytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure financial analytics calculations for the application.
 * Contains methods to safely calculate percentages, savings, budgets, and goal progress.
 */

export function calculateSavings(income: number, spent: number): number {
  return Math.max(0, income - spent);
}

export function calculateSavingsRate(income: number, spent: number): number {
  if (income <= 0) return 0;
  const savings = Math.max(0, income - spent);
  return (savings / income) * 100;
}

export function calculateBudgetUsedPct(spent: number, allocated: number): number {
  if (allocated <= 0) return 0;
  return (spent / allocated) * 100;
}

export function calculateBudgetRemaining(allocated: number, spent: number): number {
  return allocated - spent;
}

export function calculateGoalProgressPct(saved: number, target: number): number {
  if (target <= 0) return 0;
  return (saved / target) * 100;
}

export function calculateDailyAvgSpend(spent: number, days: number): number {
  if (days <= 0) return 0;
  return spent / days;
}

export function calculateAverageSpend(spent: number, count: number): number {
  if (count <= 0) return 0;
  return spent / count;
}


export function calculateGrowthPct(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function calculateCategoryPct(categorySpend: number, totalSpend: number): number {
  if (totalSpend <= 0) return 0;
  return (categorySpend / totalSpend) * 100;
}

export function calculateSpendingVelocity(targetAmount: number, savedAmount: number, daysRemaining: number): number {
  if (daysRemaining <= 0) return 0;
  return Math.max(0, (targetAmount - savedAmount) / daysRemaining);
}

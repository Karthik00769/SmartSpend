/**
 * lib/finance/calculations/analytics.ts
 * (Deprecated: Thin wrapper around core.ts)
 */
import * as Core from './core';

export const calculateSavings = Core.calculateSavings;
export const calculateSavingsRate = Core.calculateSavingsRate;
export const calculateBudgetUsedPct = Core.calculateBudgetUsage;
export const calculateBudgetRemaining = (allocated: number, spent: number) => Math.max(0, allocated - spent);
export const calculateGoalProgressPct = Core.calculateGoalProgress;
export const calculateDailyAvgSpend = (spent: number, days: number) => Core.calculateAverageSpend(spent, days);
export const calculateAverageSpend = Core.calculateAverageSpend;
export const calculateGrowthPct = Core.calculateGrowthPct;
export const calculateCategoryPct = Core.calculateCategoryPercentage;
export const calculateSpendingVelocity = (target: number, saved: number, days: number) => days <= 0 ? 0 : Math.max(0, target - saved) / days;

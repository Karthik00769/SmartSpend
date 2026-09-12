/**
 * lib/finance/calculations/reports.ts
 * (Deprecated: Thin wrapper around core.ts)
 */
import * as Core from './core';

export const roundMinor = (minor: number) => Math.round(minor);
export const roundPct = (pct: number) => Math.round(pct * 10) / 10;
export const roundRatio = (ratio: number) => Math.round(ratio * 10) / 10;
export const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

export const calculateCategoryPercentage = Core.calculateCategoryPercentage;
export const calculateSavingsMinor = Core.calculateSavings;
export const calculateSavingsRate = Core.calculateSavingsRate;
export const calculateExpenseGrowthPct = Core.calculateGrowthPct;
export const calculateAverageSpend = Core.calculateAverageSpend;
export const calculateDailyAverage = (total: number, days: number) => Core.calculateAverageSpend(total, days);

export function classifySavingsRate(savingsRatePct: number): 'low' | 'moderate' | 'good' {
  if (savingsRatePct < 10) return 'low';
  if (savingsRatePct <= 30) return 'moderate';
  return 'good';
}

export function determineTrendDirection(currentMinor: number, previousMinor: number): 'up' | 'down' | 'stable' {
  const pct = Core.calculateGrowthPct(currentMinor, previousMinor);
  if (Math.abs(pct) < 1) return 'stable';
  return currentMinor > previousMinor ? 'up' : 'down';
}

export function calculateMonthlyComparison(currentMinor: number, previousMinor: number) {
  return {
    growthPct: Core.calculateGrowthPct(currentMinor, previousMinor),
    direction: determineTrendDirection(currentMinor, previousMinor),
  };
}

export function calculateSpikeRatio(currentMinor: number, avgPrevMinor: number): number {
  if (avgPrevMinor <= 0) return 0;
  return roundRatio(currentMinor / avgPrevMinor);
}

export function calculateTwoMonthAverage(prev1Minor: number, prev2Minor: number): number {
  const divisor = (prev1Minor > 0 ? 1 : 0) + (prev2Minor > 0 ? 1 : 0);
  if (divisor === 0) return 0;
  return roundMinor((prev1Minor + prev2Minor) / divisor);
}

export function finalizeHealthScore(rawScore: number): number {
  return clamp(Math.round(rawScore), 0, 100);
}

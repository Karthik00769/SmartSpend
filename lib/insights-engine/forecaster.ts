/**
 * lib/insights-engine/forecaster.ts
 * ─────────────────────────────────────────────────────────────────────
 * Calculates projected spending by the end of the month based on current averages.
 * 
 * Logic:
 * 1.  (totalSpent / daysElapsed) * daysInMonth
 * 2.  Compare with Budget totals of that category
 * 3.  Flag 'at_risk' or 'over_budget' projections
 */

import type { CategorySummary } from '@/lib/expense-engine/types';

export interface ForecastResult {
  category:         string;
  budgetLimit:      number;
  currentSpent:     number;
  projectedSpent:   number;
  isOverBudgetRisk: boolean;
  daysRemaining:    number;
  bufferAmount:     number;
}

/**
 * calculateBudgetForecasts
 * Outputs array of forecasts per category that has budget limits set.
 */
export function calculateBudgetForecasts(
  categories: CategorySummary[],
  year:       number,
  month:      number,
): ForecastResult[] {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear  = today.getFullYear();

  // If calculating for a FUTURE month, no forecast possible (0 days)
  if (year > currentYear || (year === currentYear && month > currentMonth)) return [];
  
  // If calculating for a PAST month, forecast = totalSpent (no remaining days)
  if (year < currentYear || (year === currentYear && month < currentMonth)) return [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = Math.max(1, today.getDate()); 
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  return categories
    .filter(cat => cat.budgetLimit > 0)
    .map(cat => {
      const dailySpent     = cat.totalSpent / daysElapsed;
      const projectedSpent = Math.round(dailySpent * daysInMonth * 100) / 100;
      const isOverBudgetRisk = projectedSpent > cat.budgetLimit;
      const bufferAmount   = cat.budgetLimit - projectedSpent;

      return {
        category:         cat.name,
        budgetLimit:      cat.budgetLimit,
        currentSpent:     cat.totalSpent,
        projectedSpent,
        isOverBudgetRisk,
        daysRemaining,
        bufferAmount:     Math.round(bufferAmount * 100) / 100
      };
    });
}

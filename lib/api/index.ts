/**
 * lib/api/index.ts
 * ─────────────────────────────────────────────────────────────────────
 * Master barrel for the SmartSpend API layer.
 *
 * Import strategy:
 *   import { getExpenses, createExpense }   from '@/lib/api';
 *   import { getBudgets, upsertBudget }     from '@/lib/api';
 *   import { getGoals, createGoal }         from '@/lib/api';
 *   import { getInsights, markInsightsRead } from '@/lib/api';
 *   import { getAnalytics }                 from '@/lib/api';
 *
 * Or import a whole domain module directly:
 *   import * as InsightAPI from '@/lib/api/insightApi';
 */

// ─── Analytics ────────────────────────────────────────────────────────────────
export { getAnalytics }                               from './analyticsApi';
export type { AnalyticsBundle, GetAnalyticsOptions }  from './analyticsApi';

// ─── Expenses ─────────────────────────────────────────────────────────────────
export { getExpenses, createExpense }                 from './expenseApi';
export type {
  GetExpensesResponse,
  CreateExpenseResponse,
  CreateExpensePayload,
}                                                     from './expenseApi';

// ─── Budgets ──────────────────────────────────────────────────────────────────
export { getBudgets, upsertBudget }                   from './budgetApi';
export type {
  GetBudgetsOptions,
  UpsertBudgetPayload,
}                                                     from './budgetApi';

// ─── Goals ────────────────────────────────────────────────────────────────────
export { getGoals, createGoal }                       from './goalApi';
export type {
  GetGoalsResponse,
  CreateGoalResponse,
  GetGoalsOptions,
  CreateGoalPayload,
}                                                     from './goalApi';

// ─── Insights ─────────────────────────────────────────────────────────────────
export {
  getInsights,
  getInsightsEngine,
  markInsightsRead,
  generateInsights,
}                                                     from './insightApi';
export type {
  GetInsightsOptions,
  GetEngineOptions,
  MarkReadResponse,
  GenerateInsightsResponse,
}                                                     from './insightApi';

// ─── Error class (for instanceof checks in catch blocks) ─────────────────────
export { ApiRequestError }                            from '@/lib/api-client';

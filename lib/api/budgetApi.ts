/**
 * lib/api/budgetApi.ts
 * ─────────────────────────────────────────────────────────────────────
 * All client-side API functions for the /api/budgets endpoint.
 *
 * Functions:
 *   getBudgets(opts?)         → GET  /api/budgets
 *   upsertBudget(input)       → POST /api/budgets  (create or update)
 *
 * Example:
 *   import { getBudgets, upsertBudget } from '@/lib/api/budgetApi';
 *
 *   const summary = await getBudgets({ month: 3, year: 2026 });
 *   await upsertBudget({ categoryId: 1, limitAmount: 500, month: 3, year: 2026 });
 */

import { get, post, buildQuery } from './apiClient';
import type {
  BudgetSummaryDTO,
  UpsertBudgetInput,
} from '@/types/api';

// ─── Input helpers ────────────────────────────────────────────────────────────

export interface GetBudgetsOptions {
  month?: number;
  year?:  number;
}

/** userId is auto-resolved if omitted */
export type UpsertBudgetPayload = Omit<UpsertBudgetInput, 'userId'>;

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * getBudgets
 * Fetch the budget summary for the current user and period.
 * Returns totals + a per-category breakdown with live spend data.
 *
 * @example
 * // Current month
 * const summary = await getBudgets();
 * console.log(summary.totalBudget); // 1500
 * summary.categories.forEach(c => console.log(c.category, c.usedPct));
 *
 * // Specific month
 * const march = await getBudgets({ month: 3, year: 2026 });
 */
export async function getBudgets(
  opts: GetBudgetsOptions = {},
): Promise<BudgetSummaryDTO> {
  const now  = new Date();
  const qs   = buildQuery({
    month:  opts.month ?? now.getMonth() + 1,
    year:   opts.year  ?? now.getFullYear(),
  });
  return get<BudgetSummaryDTO>(`/api/budgets${qs}`);
}

/**
 * upsertBudget
 * Create or update a category budget limit.
 * Uses MySQL INSERT ... ON DUPLICATE KEY UPDATE so calling it twice is safe.
 *
 * @example
 * // Set food budget to $400 for March 2026
 * const updated = await upsertBudget({
 *   categoryId:  1,
 *   limitAmount: 400,
 *   month:       3,
 *   year:        2026,
 * });
 * console.log(updated.totalBudget); // reflects the new limit
 */
export async function upsertBudget(
  input: UpsertBudgetPayload,
): Promise<BudgetSummaryDTO> {
  return post<BudgetSummaryDTO>('/api/budgets', {
    ...input,
  });
}

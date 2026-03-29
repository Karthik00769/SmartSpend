/**
 * lib/api/expenseApi.ts
 * ─────────────────────────────────────────────────────────────────────
 * All client-side API functions for the /api/expenses endpoint.
 *
 * Functions:
 *   getExpenses(opts?)        → GET  /api/expenses
 *   getExpense(id)            → GET  /api/expenses/:id   (future)
 *   createExpense(input)      → POST /api/expenses
 *
 * Example:
 *   import { getExpenses, createExpense } from '@/lib/api/expenseApi';
 *
 *   const { expenses } = await getExpenses({ month: 3, year: 2026 });
 *   const result       = await createExpense({ amount: 49.99, date: '2026-03-15', description: 'Uber' });
 */

import { get, post, buildQuery } from './apiClient';
import type {
  ExpenseDTO,
  CreateExpenseInput,
  GetExpensesQuery,
} from '@/types/api';

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface GetExpensesResponse {
  expenses: ExpenseDTO[];
  count:    number;
}

export interface CreateExpenseResponse {
  expenseId:      string;
  autoCategized:  boolean;
  categorization: {
    categoryId:   number;
    categoryName: string;
    confidence:   'exact' | 'keyword' | 'fallback';
    matchedOn?:   string;
  };
}

// ─── Input helpers ────────────────────────────────────────────────────────────

export type CreateExpensePayload = Omit<CreateExpenseInput, 'userId'> & {
    category?: string;
  };

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * getExpenses
 * Fetch a paginated list of expenses for the current user.
 *
 * @param opts  Optional filters: { month, year, limit }
 *
 * @example
 * // All expenses this month
 * const { expenses } = await getExpenses();
 *
 * // March 2026, max 20
 * const { expenses } = await getExpenses({ month: 3, year: 2026, limit: 20 });
 */
export async function getExpenses(
  opts: Omit<GetExpensesQuery, 'userId'> = {},
): Promise<GetExpensesResponse> {
  const qs = buildQuery({ ...opts });
  return get<GetExpensesResponse>(`/api/expenses${qs}`);
}

/**
 * createExpense
 * Submit a new expense through the Expense Processing Engine.
 * If categoryId is omitted, the engine auto-categorizes from the description.
 *
 * @example
 * const result = await createExpense({
 *   amount:      89.99,
 *   date:        '2026-03-15',
 *   description: 'Netflix subscription',
 * });
 * console.log(result.categorization.categoryName); // "Subscriptions"
 */
export async function createExpense(
  input: CreateExpensePayload,
): Promise<CreateExpenseResponse> {
  return post<CreateExpenseResponse>('/api/expenses', {
    ...input,
  });
}

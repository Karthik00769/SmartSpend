/**
 * hooks/use-expenses.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  — list recent expenses (with category names/icons)
 * POST — create a new expense (triggers engine processing)
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, buildQuery, ApiRequestError } from '@/lib/api-client';
import type { ExpenseDTO } from '@/types/api';

// ─── Payload for creating an expense ──────────────────────────────────────────

export interface AddExpensePayload {
  amount:      number;
  date:        string;    // YYYY-MM-DD
  description: string;
  categoryId?: number;    // explicitly set by user
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseExpensesOptions {
  year?:   number;
  month?:  number;
  limit?:  number;
}

export interface UseExpensesReturn {
  expenses:    ExpenseDTO[];
  loading:     boolean;
  error:       string | null;
  submitting:  boolean;
  submitError: string | null;
  addExpense:  (payload: AddExpensePayload) => Promise<{
    expenseId:      string;
    autoCategized:  boolean;
    categorization: { categoryId: number; categoryName: string; confidence: string; matchedOn?: string };
  } | false>;
  refresh:     () => void;
}

export function useExpenses(opts: UseExpensesOptions = {}): UseExpensesReturn {
  const year   = opts.year;
  const month  = opts.month;
  const limit  = opts.limit ?? 50;

  const [expenses,      setExpenses]      = useState<ExpenseDTO[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState<string | null>(null);
  const [tick,          setTick]          = useState(0);

  const refresh = useCallback(() => setTick(n => n + 1), []);

  // ── Fetch expenses ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchExpenses() {
      setLoading(true);
      setError(null);
      try {
        const qs   = buildQuery({ year, month, limit });
        const data = await apiGet<{ expenses: ExpenseDTO[] }>(`/api/expenses${qs}`);
        if (!cancelled) setExpenses(data.expenses);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError ? err.message : 'Failed to load expenses.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchExpenses();
    return () => { cancelled = true; };
  }, [year, month, limit, tick]);

  // ── Add expense ─────────────────────────────────────────────────────────────
  const addExpense = useCallback(
    async (payload: AddExpensePayload) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await apiPost<{
          expenseId:      string;
          autoCategized:  boolean;
          categorization: { categoryId: number; categoryName: string; confidence: string; matchedOn?: string };
        }>('/api/expenses', {
          ...payload,
        });
        refresh();
        return res;
      } catch (err) {
        setSubmitError(
          err instanceof ApiRequestError ? err.message : 'Failed to save expense.',
        );
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [refresh],
  );

  return { expenses, loading, error, submitting, submitError, addExpense, refresh };
}

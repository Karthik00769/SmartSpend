/**
 * hooks/use-expenses.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  — list recent expenses (with category names/icons)
 * POST — create a new expense (triggers engine processing)
 *
 * OFFLINE SUPPORT:
 * When navigator.onLine === false, addExpense() saves the payload to
 * IndexedDB/localStorage via offlineStorage and returns a synthetic
 * "saved offline" result. The online path is completely unchanged.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, buildQuery, ApiRequestError } from '@/lib/api-client';
import { saveExpenseOffline } from '@/lib/offline/offlineStorage';
import type { ExpenseDTO } from '@/types/api';

// ─── Payload for creating an expense ──────────────────────────────────────────

export interface AddExpensePayload {
  amount:        number;
  date:          string;
  description:   string;
  categoryId?:   number;
  categoryName?: string;
  source?:       'manual' | 'receipt_scan' | 'bank_import';
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
    expense:        ExpenseDTO;
    dateAdjusted:   boolean;
    message:        string;
    budgetStatus?:  { usedPercent: number; status: 'under' | 'near' | 'over' } | null;
    goalStatus?:    { progress: number } | null;
    // legacy compat
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
      // ── OFFLINE PATH ──────────────────────────────────────────────────────────
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        try {
          await saveExpenseOffline(payload);
          // Return a synthetic "offline" sentinel that callers treat as truthy.
          // The fields match the online response shape so the UI still works.
          return {
            expense:        null as unknown as ExpenseDTO,
            dateAdjusted:   false,
            message:        `Saved offline for ${payload.date} — will sync when back online.`,
            budgetStatus:   null,
            goalStatus:     null,
            expenseId:      `offline-${Date.now()}`,
            autoCategized:  false,
            categorization: {
              categoryId:   0,
              categoryName: payload.categoryName ?? 'Uncategorized',
              confidence:   'low',
            },
            _offline: true,
          } as const;
        } catch {
          setSubmitError('Failed to save expense offline.');
          return false;
        }
      }

      // ── ONLINE PATH (unchanged) ───────────────────────────────────────────────
      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await apiPost<{
          expense:        ExpenseDTO;
          dateAdjusted:   boolean;
          message:        string;
          budgetStatus?:  { usedPercent: number; status: 'under' | 'near' | 'over' } | null;
          goalStatus?:    { progress: number } | null;
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

/**
 * hooks/use-budgets.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  — fetch budgets for a given month (with live spend totals)
 * POST — upsert a single category budget
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, buildQuery, ApiRequestError } from '@/lib/api-client';
import type { BudgetSummaryDTO } from '@/types/api';

// ─── Payload for creating/updating a budget ───────────────────────────────────

export interface UpsertBudgetPayload {
  categoryId:   number;
  category?:    string;
  amount:       number;
  year?:        number;
  month?:       number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseBudgetsOptions {
  year?:   number;
  month?:  number;
}

export interface UseBudgetsReturn {
  budget:        BudgetSummaryDTO | null;
  loading:       boolean;
  error:         string | null;
  submitting:    boolean;
  submitError:   string | null;
  upsertBudget:  (payload: UpsertBudgetPayload) => Promise<boolean>;
  refresh:       () => void;
}

export function useBudgets(opts: UseBudgetsOptions = {}): UseBudgetsReturn {
  const now    = new Date();
  const year   = opts.year   ?? now.getFullYear();
  const month  = opts.month  ?? now.getMonth() + 1;

  const [budget,      setBudget]    = useState<BudgetSummaryDTO | null>(null);
  const [loading,     setLoading]   = useState(true);
  const [error,       setError]     = useState<string | null>(null);
  const [submitting,  setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tick,        setTick]       = useState(0);

  const refresh = useCallback(() => setTick(n => n + 1), []);

  // ── Fetch budgets ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchBudgets() {
      setLoading(true);
      setError(null);
      try {
        const qs   = buildQuery({ year, month });
        const data = await apiGet<BudgetSummaryDTO>(`/api/budgets${qs}`);
        if (!cancelled) setBudget(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError ? err.message : 'Failed to load budgets.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBudgets();
    return () => { cancelled = true; };
  }, [year, month, tick]);

  // ── Upsert budget ───────────────────────────────────────────────────────────
  const upsertBudget = useCallback(
    async (payload: UpsertBudgetPayload): Promise<boolean> => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        await apiPost('/api/budgets', {
          categoryId:  payload.categoryId,
          category:    payload.category,
          amount:      payload.amount,
          year:        payload.year  ?? year,
          month:       payload.month ?? month,
        });
        refresh();
        return true;
      } catch (err) {
        setSubmitError(
          err instanceof ApiRequestError ? err.message : 'Failed to save budget.',
        );
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [year, month, refresh],
  );

  return { budget, loading, error, submitting, submitError, upsertBudget, refresh };
}

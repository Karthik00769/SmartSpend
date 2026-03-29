/**
 * hooks/use-dashboard.ts
 * ─────────────────────────────────────────────────────────────────────
 * Fetches the full analytics bundle for the dashboard.
 * Calls GET /api/analytics which returns summary + chart data in one shot.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, buildQuery, ApiRequestError } from '@/lib/api-client';
import type { MonthlySummary, ChartBundle, CategorySummary, WeeklySummary } from '@/lib/expense-engine/types';

// ─── Response shape ───────────────────────────────────────────────────────────

export interface DashboardData {
  period: {
    year:  number;
    month: number;
    label: string;
  };
  summary:    MonthlySummary;
  weekly:     WeeklySummary[];
  categories: CategorySummary[];
  charts:     ChartBundle;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseDashboardOptions {
  userId?: string;
  year?:   number;
  month?:  number;
}

export interface UseDashboardReturn {
  data:     DashboardData | null;
  loading:  boolean;
  error:    string | null;
  refresh:  () => void;
}

export function useDashboard(opts: UseDashboardOptions = {}): UseDashboardReturn {
  const now    = new Date();
  const year   = opts.year   ?? now.getFullYear();
  const month  = opts.month  ?? now.getMonth() + 1;

  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  const refresh = useCallback(() => setTick(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const qs   = buildQuery({ year, month });
        const result = await apiGet<DashboardData>(`/api/analytics${qs}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError ? err.message : 'Failed to load dashboard.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [year, month, tick]);

  return { data, loading, error, refresh };
}

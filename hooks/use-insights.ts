/**
 * hooks/use-insights.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  — runs the full Insights Engine (/api/insights/engine)
 * PATCH — marks all notifications as read (/api/insights)
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPatch, buildQuery, ApiRequestError } from '@/lib/api-client';
import type { InsightsEngineOutput } from '@/lib/insights-engine/types';
import { subscribeInsightsRefresh } from '@/context/smartspend-context';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseInsightsOptions {
  year?:   number;
  month?:  number;
  months?: number;  // how many months of trend data to include (default 3)
}

export interface UseInsightsReturn {
  data:       InsightsEngineOutput | null;
  loading:    boolean;
  error:      string | null;
  markingRead: boolean;
  markAllRead: () => Promise<void>;
  refresh:    () => void;
}

export function useInsights(opts: UseInsightsOptions = {}): UseInsightsReturn {
  const now    = new Date();
  const year   = opts.year   ?? now.getFullYear();
  const month  = opts.month  ?? now.getMonth() + 1;
  const months = opts.months ?? 3;

  const [data,        setData]        = useState<InsightsEngineOutput | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [tick,        setTick]        = useState(0);

  const refresh = useCallback(() => setTick(n => n + 1), []);

  // Subscribe to global expense-added signal so insights auto-refresh
  useEffect(() => {
    const unsubscribe = subscribeInsightsRefresh(() => setTick(n => n + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  // ── Fetch engine output ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchInsights() {
      setLoading(true);
      setError(null);
      try {
        const qs     = buildQuery({ year, month, months });
        const result = await apiGet<InsightsEngineOutput>(`/api/insights/engine${qs}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError ? err.message : 'Failed to load insights.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInsights();
    return () => { cancelled = true; };
  }, [year, month, months, tick]);

  // ── Mark all read ───────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    setMarkingRead(true);
    try {
      await apiPatch('/api/insights', {}); // Session based ID on backend
    } catch(_) {
      // silent — notification read state is non-critical
    } finally {
      setMarkingRead(false);
    }
  }, []);

  return { data, loading, error, markingRead, markAllRead, refresh };
}

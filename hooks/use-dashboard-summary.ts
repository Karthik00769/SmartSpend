/**
 * hooks/use-dashboard-summary.ts
 * ─────────────────────────────────────────────────────────────────────
 * Fetches the dashboard summary KPIs from /api/dashboard-summary.
 * Uses the apiGet helper which auto-unwraps the { ok, data } envelope.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, ApiRequestError } from '@/lib/api-client';

export interface DashboardSummaryData {
  totalSpending: number;
  savingsRate: number;
  budgetProgress: Array<{
    category: string;
    allocated: number;
    spent: number;
    remaining: number;
    isOverBudget: boolean;
    usedPct: number | null;
  }>;
  recentInsights: Array<{
    id: number;
    type: string;
    content: string;
    isRead: boolean;
    createdAt: string;
    minutesAgo: number;
  }>;
  monthlyTrend: Array<{
    label: string;
    spent: number;
  }>;
  financialHealthScore: {
    score: number;
    status: 'excellent' | 'good' | 'warning' | 'critical';
  };
}

export function useDashboardSummary() {
  const [data, setData] = useState<DashboardSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      setLoading(true);
      setError(null);

      try {
        // apiGet auto-unwraps the { ok: true, data: {...} } envelope
        const result = await apiGet<DashboardSummaryData>('/api/dashboard-summary');

        if (!cancelled) {
          setData(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError
              ? err.message
              : 'An unexpected error occurred.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { data, loading, error, refresh };
}

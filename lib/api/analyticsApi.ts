/**
 * lib/api/analyticsApi.ts
 * ─────────────────────────────────────────────────────────────────────
 * Client-side API functions for the /api/analytics endpoint.
 *
 * Functions:
 *   getAnalytics(opts?)       → GET  /api/analytics
 *
 * This is the single dashboard "bundle" endpoint returning KPIs,
 * weekly breakdown, category totals, and Recharts chart data.
 *
 * Example:
 *   import { getAnalytics } from '@/lib/api/analyticsApi';
 *   const bundle = await getAnalytics();
 *   console.log(bundle.summary.totalSpent);
 */

import { get, buildQuery } from './apiClient';
import type { MonthlySummary, WeeklySummary, CategorySummary, ChartBundle } from '@/types/engine';

// ─── Response shape ───────────────────────────────────────────────────────────

export interface AnalyticsBundle {
  period: {
    year:  number;
    month: number;
    label: string;    // "March 2026"
  };
  summary:    MonthlySummary;
  weekly:     WeeklySummary[];
  categories: CategorySummary[];
  charts:     ChartBundle;
}

// ─── Input options ────────────────────────────────────────────────────────────

export interface GetAnalyticsOptions {
  month?: number;
  year?:  number;
}

// ─── API function ─────────────────────────────────────────────────────────────

/**
 * getAnalytics
 * Fetch the full analytics bundle for the current user and period.
 * One request covers everything the Dashboard needs — no waterfalls.
 *
 * @example
 * // Current month
 * const bundle = await getAnalytics();
 * console.log(bundle.summary.totalSpent);
 * console.log(bundle.charts.pieChart);   // ready for Recharts <PieChart>
 *
 * // Specific period
 * const march = await getAnalytics({ month: 3, year: 2026 });
 */
export async function getAnalytics(
  opts: GetAnalyticsOptions = {},
): Promise<AnalyticsBundle> {
  const now = new Date();
  const qs  = buildQuery({
    month:  opts.month ?? now.getMonth() + 1,
    year:   opts.year  ?? now.getFullYear(),
  });
  return get<AnalyticsBundle>(`/api/analytics${qs}`);
}

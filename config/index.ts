/**
 * lib/constants.ts — already exists, this file is kept as-is.
 *
 * config/index.ts
 * ─────────────────────────────────────────────────────────────────────
 * App-wide static configuration: feature flags, display limits,
 * supported locales, and environment-derived settings.
 *
 * Usage: import { APP_CONFIG } from '@/config';
 */

// ─── Core app metadata ────────────────────────────────────────────────────────

export const APP_CONFIG = {
  /** Displayed in <title> and the sidebar header */
  appName:     'SmartSpend',
  appTagline:  'Goal-driven personal finance',
  appVersion:  '1.0.0',

  /** Max expenses fetched per page request */
  pageSize:    50,

  /** Number of months to show in trend charts */
  trendMonths: 6,

  /** Currency locale used by Intl.NumberFormat */
  currency:    'USD',
  locale:      'en-US',

  /** Base URL — falls back to localhost in dev */
  baseUrl:
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
} as const;

// ─── Feature flags ────────────────────────────────────────────────────────────

export const FEATURES = {
  /** Shows the upload-receipt flow (needs OCR integration) */
  receiptUpload:    false,

  /** Shows the reports page in nav */
  reports:          true,

  /** Enables the AI insights engine tab */
  insightsEngine:   true,

  /** Shows goal probability projections (uses insights engine) */
  goalProbability:  true,
} as const;

// ─── API base paths ───────────────────────────────────────────────────────────

export const API_PATHS = {
  analytics:    '/api/analytics',
  expenses:     '/api/expenses',
  budgets:      '/api/budgets',
  goals:        '/api/goals',
  insights:     '/api/insights',
  insightsEngine: '/api/insights/engine',
  categories:   '/api/categories',
  reports:      '/api/reports',
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];

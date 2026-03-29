/**
 * lib/analytics/index.ts
 * ─────────────────────────────────────────────────────────────────────
 * Pure, side-effect-free helpers for formatting and computing analytics
 * values shown in charts, cards, and summaries.
 *
 * All functions here are purely presentational — they never hit the DB
 * or fetch from an API. See lib/expense-engine for processing logic.
 */

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Format a number as USD, e.g. 1234.5 → "$1,234.50"
 * Optionally collapse to compact form: 1_234_500 → "$1.2M"
 */
export function formatCurrency(
  amount: number,
  opts: { compact?: boolean; digits?: number } = {},
): string {
  const { compact = false, digits = 2 } = opts;
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    notation:              compact ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : digits,
    maximumFractionDigits: compact ? 1 : digits,
  }).format(amount);
}

// ─── Percentage ───────────────────────────────────────────────────────────────

/**
 * Safe percentage — avoids division by zero.
 * Returns 0 when denominator is 0.
 */
export function safePct(numerator: number, denominator: number, decimals = 1): number {
  if (!denominator) return 0;
  return parseFloat(((numerator / denominator) * 100).toFixed(decimals));
}

/**
 * Format percentage as "12.4%" string.
 */
export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** "2026-03" → "March 2026" */
export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year:  'numeric',
  });
}

/** Returns ISO YYYY-MM-DD for today */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Days between two ISO date strings (positive if b > a) */
export function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round((Date.parse(b) - Date.parse(a)) / msPerDay);
}

// ─── Delta helpers ────────────────────────────────────────────────────────────

export type ChangeDirection = 'up' | 'down' | 'stable';

export interface ValueChange {
  current:   number;
  previous:  number;
  delta:     number;
  pct:       number;
  direction: ChangeDirection;
}

/**
 * Compute how a value changed from one period to the next.
 * direction = 'up' | 'down' | 'stable' (within 1% tolerance).
 */
export function computeChange(current: number, previous: number): ValueChange {
  const delta     = current - previous;
  const pct       = safePct(delta, previous);
  const direction: ChangeDirection =
    Math.abs(pct) < 1 ? 'stable' : delta > 0 ? 'up' : 'down';

  return { current, previous, delta, pct, direction };
}

// ─── KPI derivation ───────────────────────────────────────────────────────────

/**
 * Derive savings and rate from income + spent.
 * Returns 0 for savings if income is unknown.
 */
export function deriveSavings(
  income: number,
  spent: number,
): { savings: number; savingsRate: number } {
  const savings     = Math.max(0, income - spent);
  const savingsRate = safePct(savings, income);
  return { savings, savingsRate };
}

/**
 * Colour bucket for a spending percentage of budget.
 * Returns one of: "green" | "yellow" | "red"
 */
export function budgetHealthColor(usedPct: number): 'green' | 'yellow' | 'red' {
  if (usedPct < 75)  return 'green';
  if (usedPct < 100) return 'yellow';
  return 'red';
}

/**
 * context/index.ts
 * ─────────────────────────────────────────────────────────────────────
 * Barrel for all SmartSpend context providers and hooks.
 *
 * Usage: import { useAuth, useFinance, useSmartSpend } from '@/context';
 */

// Auth
export { AuthProvider, useAuth }             from './AuthContext';
export type { AuthUser }                     from './AuthContext';

// Finance (summary, budgets, goals)
export { FinanceProvider, useFinance }       from './FinanceContext';
export type {
  FinancePeriod,
  DashboardSummary,
  AsyncState,
}                                            from './FinanceContext';

// Full orchestrated state (expenses + all domains)
export { SmartSpendProvider, useSmartSpend } from './smartspend-context';

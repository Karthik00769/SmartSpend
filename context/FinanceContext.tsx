/**
 * context/FinanceContext.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Focused finance state — dashboard summary, budgets, and goals.
 *
 * This context sits BELOW AuthContext in the tree so it can read the
 * current user ID from useAuth() automatically — no userId prop needed.
 *
 * Relationship to SmartSpendContext:
 *   SmartSpendContext  → orchestrates ALL hooks + cross-domain refreshes.
 *   FinanceContext     → lightweight alias exposing the subset of state
 *                        that most components actually need: summary KPIs,
 *                        budget categories, active goals, and period control.
 *   AuthContext        → user identity only.
 *
 * Provider location:
 *   app/(app)/layout.tsx  ← authenticated routes only
 *
 * Usage:
 *   const { summary, budgets, goals, period, setPeriod } = useFinance();
 */
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

import { useAuth, type AuthUser }   from './AuthContext';
import { getAnalytics }              from '@/lib/api/analyticsApi';
import { getBudgets, upsertBudget }  from '@/lib/api/budgetApi';
import { getGoals, createGoal }      from '@/lib/api/goalApi';
import { ApiRequestError }           from '@/lib/api-client';

import type { BudgetSummaryDTO, GoalDTO, UpsertBudgetInput, CreateGoalInput, Priority } from '@/types/api';
import type { MonthlySummary, CategorySummary }                                         from '@/lib/expense-engine/types';

// ─── Sub-state shapes ─────────────────────────────────────────────────────────

export interface FinancePeriod {
  year:  number;
  month: number;
  label: string;    // "March 2026"
}

export interface DashboardSummary {
  period:     FinancePeriod;
  kpis:       MonthlySummary;
  categories: CategorySummary[];
}

export type AsyncState<T> = {
  data:    T | null;
  loading: boolean;
  error:   string | null;
};

// ─── Context shape ────────────────────────────────────────────────────────────

interface FinanceContextValue {
  /** Current authenticated user (convenience re-export from AuthContext) */
  user: AuthUser | null;

  // ── Period control ────────────────────────────────────────────────────────
  period:    { year: number; month: number };
  setPeriod: (year: number, month: number) => void;

  // ── Dashboard summary ─────────────────────────────────────────────────────
  summary:        DashboardSummary | null;
  summaryLoading: boolean;
  summaryError:   string | null;
  refreshSummary: () => void;

  // ── Budgets ───────────────────────────────────────────────────────────────
  budgets:        BudgetSummaryDTO | null;
  budgetsLoading: boolean;
  budgetsError:   string | null;
  refreshBudgets: () => void;
  saveBudget: (input: Omit<UpsertBudgetInput, 'userId'>) => Promise<boolean>;

  // ── Goals ─────────────────────────────────────────────────────────────────
  goals:        GoalDTO[];
  goalsLoading: boolean;
  goalsError:   string | null;
  refreshGoals: () => void;
  addGoal: (input: Omit<CreateGoalInput, 'userId'> & { priority?: Priority }) => Promise<GoalDTO | null>;

  // ── Global refresh ────────────────────────────────────────────────────────
  refreshAll: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FinanceContext = createContext<FinanceContextValue | null>(null);

// ─── Internal helper — simple async slice hook ────────────────────────────────

function useAsyncSlice<T>(
  fetcher: () => Promise<T>,
  deps:    unknown[],
): AsyncState<T> & { refresh: () => void } {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  const refresh = useCallback(() => setTick(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then(result => { if (!cancelled) setData(result); })
      .catch(err   => {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Failed to load data.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, refresh };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { user }  = useAuth();

  const now                = new Date();
  const [period, setPeriodState] = useState({
    year:  now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const setPeriod = useCallback((year: number, month: number) => {
    setPeriodState({ year, month });
  }, []);

  // ── Analytics / summary ───────────────────────────────────────────────────
  const analyticsSlice = useAsyncSlice(
    () => getAnalytics({ year: period.year, month: period.month }),
    [period.year, period.month],
  );

  const summary: DashboardSummary | null = analyticsSlice.data
    ? {
        period: {
          year:  analyticsSlice.data.period.year,
          month: analyticsSlice.data.period.month,
          label: analyticsSlice.data.period.label,
        },
        kpis:       analyticsSlice.data.summary,
        categories: analyticsSlice.data.categories,
      }
    : null;

  // ── Budgets ───────────────────────────────────────────────────────────────
  const budgetSlice = useAsyncSlice(
    () => getBudgets({ year: period.year, month: period.month }),
    [period.year, period.month],
  );

  const saveBudget = useCallback(
    async (input: Omit<UpsertBudgetInput, 'userId'>): Promise<boolean> => {
      try {
        await upsertBudget(input);
        budgetSlice.refresh();
        analyticsSlice.refresh();
        return true;
      } catch (err) {
        console.error('[FinanceContext] saveBudget failed:', err);
        return false;
      }
    },
    [budgetSlice, analyticsSlice],
  );

  // ── Goals ─────────────────────────────────────────────────────────────────
  const goalSlice = useAsyncSlice(
    () => getGoals({ status: 'active' }),
    [],
  );

  const addGoal = useCallback(
    async (
      input: Omit<CreateGoalInput, 'userId'> & { priority?: Priority },
    ): Promise<GoalDTO | null> => {
      try {
        const { goal } = await createGoal(input);
        goalSlice.refresh();
        analyticsSlice.refresh();
        return goal;
      } catch (err) {
        console.error('[FinanceContext] addGoal failed:', err);
        return null;
      }
    },
    [goalSlice, analyticsSlice],
  );

  // ── refreshAll ────────────────────────────────────────────────────────────
  const refreshAll = useCallback(() => {
    analyticsSlice.refresh();
    budgetSlice.refresh();
    goalSlice.refresh();
  }, [analyticsSlice, budgetSlice, goalSlice]);

  const value: FinanceContextValue = {
    user,
    period,
    setPeriod,

    summary,
    summaryLoading: analyticsSlice.loading,
    summaryError:   analyticsSlice.error,
    refreshSummary: analyticsSlice.refresh,

    budgets:        budgetSlice.data,
    budgetsLoading: budgetSlice.loading,
    budgetsError:   budgetSlice.error,
    refreshBudgets: budgetSlice.refresh,
    saveBudget,

    goals:        goalSlice.data?.goals ?? [],
    goalsLoading: goalSlice.loading,
    goalsError:   goalSlice.error,
    refreshGoals: goalSlice.refresh,
    addGoal,

    refreshAll,
  };

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

/**
 * useFinance
 * Access dashboard summary, budget data, and goals.
 *
 * @throws if used outside <FinanceProvider>
 *
 * @example
 * const { summary, budgets, goals, saveBudget, addGoal } = useFinance();
 *
 * // Read KPIs
 * console.log(summary?.kpis.totalSpent);
 *
 * // Update a budget
 * await saveBudget({ categoryId: 1, limitAmount: 500, month: 3, year: 2026 });
 *
 * // Create a goal
 * const goal = await addGoal({ title: 'Emergency Fund', targetAmount: 5000, targetDate: '2026-12-31' });
 */
export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error('useFinance() must be used inside <FinanceProvider>. Wrap your app routes in <FinanceProvider>.');
  }
  return ctx;
}

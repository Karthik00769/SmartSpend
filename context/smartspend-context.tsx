/**
 * context/smartspend-context.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Global React Context that wires together all data domains.
 *
 * After any mutation (addExpense, upsertBudget, createGoal) we call
 * refreshAll() which re-fetches analytics, budgets, expenses, goals, AND
 * the dashboard summary — so every page updates immediately without
 * requiring a manual reload.
 */
'use client';

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from 'react';

import { useDashboard,        type DashboardData }       from '@/hooks/use-dashboard';
import { useDashboardSummary, type DashboardSummaryData } from '@/hooks/use-dashboard-summary';
import { useExpenses,   type AddExpensePayload }          from '@/hooks/use-expenses';
import { useBudgets,    type UpsertBudgetPayload }        from '@/hooks/use-budgets';
import { useGoals,      type CreateGoalPayload }          from '@/hooks/use-goals';
import { useCurrency }                                    from '@/hooks/use-currency';
import { useOfflineSync }                                 from '@/hooks/use-offline-sync';

// Module-level signal so insights pages re-fetch after any expense mutation
let _insightsTick = 0;
const _insightsListeners = new Set<() => void>();
export function notifyInsightsRefresh() {
  _insightsTick++;
  _insightsListeners.forEach(fn => fn());
}
export function subscribeInsightsRefresh(fn: () => void) {
  _insightsListeners.add(fn);
  return () => _insightsListeners.delete(fn);
}

import type { ExpenseDTO, BudgetSummaryDTO, GoalDTO } from '@/types/api';

// ─── Context shape ────────────────────────────────────────────────────────────

interface SmartSpendContextValue {
  period: { year: number; month: number };
  setPeriod: (year: number, month: number) => void;

  // Analytics dashboard (calls /api/analytics)
  dashboard:        DashboardData | null;
  dashboardLoading: boolean;
  dashboardError:   string | null;

  // KPI dashboard (calls /api/dashboard-summary — used by dashboard page)
  dashboardSummary:        DashboardSummaryData | null;
  dashboardSummaryLoading: boolean;
  dashboardSummaryError:   string | null;
  refreshDashboardSummary: () => void;

  // Expenses
  expenses:        ExpenseDTO[];
  expensesLoading: boolean;
  expensesError:   string | null;
  submitting:      boolean;
  submitError:     string | null;
  addExpense: (p: AddExpensePayload) => Promise<{
    expense:        import('@/types/api').ExpenseDTO | null;
    dateAdjusted:   boolean;
    message:        string;
    budgetStatus?:  { usedPercent: number; status: 'under' | 'near' | 'over' } | null;
    goalStatus?:    { progress: number } | null;
    expenseId:      string;
    autoCategized:  boolean;
    categorization: { categoryId: number; categoryName: string; confidence: string; matchedOn?: string };
    _offline?:      boolean;
  } | false>;

  // Budgets
  budget:            BudgetSummaryDTO | null;
  budgetLoading:     boolean;
  budgetError:       string | null;
  budgetSubmitting:  boolean;
  budgetSubmitError: string | null;
  upsertBudget: (p: UpsertBudgetPayload) => Promise<boolean>;

  // Goals
  goals:           GoalDTO[];
  goalsLoading:    boolean;
  goalsError:      string | null;
  goalSubmitting:  boolean;
  goalSubmitError: string | null;
  createGoal:    (p: CreateGoalPayload) => Promise<GoalDTO | null>;
  depositToGoal: (goalId: number, amount: number) => Promise<boolean>;
  updateGoal:    (goalId: number, patch: Record<string, any>) => Promise<boolean>;
  deleteGoal:    (goalId: number) => Promise<boolean>;

  // Global
  refreshAll: () => void;
  currency:   string;
  fmt:        (amount: number) => string;

  // Offline
  isOnline:     boolean;
  pendingCount: number;
  isSyncing:    boolean;
  triggerSync:  () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SmartSpendContext = createContext<SmartSpendContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface SmartSpendProviderProps {
  children: ReactNode;
}

export function SmartSpendProvider({ children }: SmartSpendProviderProps) {
  const now = new Date();
  const [period, setPeriodState] = useState({
    year:  now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const setPeriod = useCallback((year: number, month: number) => {
    setPeriodState({ year, month });
  }, []);

  // ── Individual hooks ──────────────────────────────────────────────────────
  const dashH    = useDashboard({ ...period });
  const summaryH = useDashboardSummary();
  const expH     = useExpenses({ ...period, limit: 500 });
  const budH     = useBudgets({ ...period });
  const goaH     = useGoals({ status: 'all' });
  const currH    = useCurrency();

  // ── refreshAll — refetches EVERY data source simultaneously ──────────────
  const refreshAll = useCallback(() => {
    dashH.refresh();
    summaryH.refresh();
    expH.refresh();
    budH.refresh();
    goaH.refresh();
  }, [dashH.refresh, summaryH.refresh, expH.refresh, budH.refresh, goaH.refresh]);

  // ── Offline sync ─────────────────────────────────────────────────────────
  const offlineSync = useOfflineSync({
    poster: expH.addExpense,
    onSynced: (count) => {
      refreshAll();
      notifyInsightsRefresh();
      // Lazy-import toast to avoid a hard SSR dep on sonner in this context module
      import('sonner').then(({ toast }) => {
        toast.success(
          `${count} offline expense${count > 1 ? 's' : ''} synced successfully!`,
          { duration: 5000 },
        );
      });
    },
  });

  // ── After adding an expense, refresh all affected hooks ──────────────────
  const addExpense = useCallback(
    async (payload: AddExpensePayload) => {
      const success = await expH.addExpense(payload);
      if (success) {
        refreshAll();
        notifyInsightsRefresh(); // insights page re-fetches on next render
      }
      return success;
    },
    [expH.addExpense, refreshAll],
  );

  // ── After creating a goal, refresh analytics + KPI dashboard ─────────────
  const createGoal = useCallback(
    async (payload: CreateGoalPayload) => {
      const result = await goaH.createGoal(payload);
      if (result) {
        dashH.refresh();
        summaryH.refresh();
      }
      return result;
    },
    [goaH.createGoal, dashH.refresh, summaryH.refresh],
  );

  // ── After depositing to a goal, refresh analytics + KPI dashboard ──────────
  const depositToGoal = useCallback(
    async (goalId: number, amount: number) => {
      const success = await goaH.depositToGoal(goalId, amount);
      if (success) { dashH.refresh(); summaryH.refresh(); }
      return success;
    },
    [goaH.depositToGoal, dashH.refresh, summaryH.refresh],
  );

  const updateGoal = useCallback(
    async (goalId: number, patch: Record<string, any>) => {
      const success = await goaH.updateGoal(goalId, patch);
      if (success) { dashH.refresh(); summaryH.refresh(); }
      return success;
    },
    [goaH.updateGoal, dashH.refresh, summaryH.refresh],
  );

  const deleteGoal = useCallback(
    async (goalId: number) => {
      const success = await goaH.deleteGoal(goalId);
      if (success) { dashH.refresh(); summaryH.refresh(); }
      return success;
    },
    [goaH.deleteGoal, dashH.refresh, summaryH.refresh],
  );

  // ── After upserting a budget, refresh analytics + KPI dashboard ──────────
  const upsertBudget = useCallback(
    async (payload: UpsertBudgetPayload) => {
      const result = await budH.upsertBudget(payload);
      if (result) {
        dashH.refresh();
        summaryH.refresh();
      }
      return result;
    },
    [budH.upsertBudget, dashH.refresh, summaryH.refresh],
  );

  const value: SmartSpendContextValue = {
    period,
    setPeriod,

    dashboard:        dashH.data,
    dashboardLoading: dashH.loading,
    dashboardError:   dashH.error,

    dashboardSummary:        summaryH.data,
    dashboardSummaryLoading: summaryH.loading,
    dashboardSummaryError:   summaryH.error,
    refreshDashboardSummary: summaryH.refresh,

    expenses:         expH.expenses,
    expensesLoading:  expH.loading,
    expensesError:    expH.error,
    submitting:       expH.submitting,
    submitError:      expH.submitError,
    addExpense,

    budget:            budH.budget,
    budgetLoading:     budH.loading,
    budgetError:       budH.error,
    budgetSubmitting:  budH.submitting,
    budgetSubmitError: budH.submitError,
    upsertBudget,

    goals:           goaH.goals,
    goalsLoading:    goaH.loading,
    goalsError:      goaH.error,
    goalSubmitting:  goaH.submitting,
    goalSubmitError: goaH.submitError,
    createGoal,
    depositToGoal,
    updateGoal,
    deleteGoal,

    refreshAll,
    currency: currH.currency,
    fmt:      currH.fmt,

    isOnline:     offlineSync.isOnline,
    pendingCount: offlineSync.pendingCount,
    isSyncing:    offlineSync.isSyncing,
    triggerSync:  offlineSync.triggerSync,
  };

  return (
    <SmartSpendContext.Provider value={value}>
      {children}
    </SmartSpendContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useSmartSpend(): SmartSpendContextValue {
  const ctx = useContext(SmartSpendContext);
  if (!ctx) {
    throw new Error('useSmartSpend must be used inside <SmartSpendProvider>');
  }
  return ctx;
}

/**
 * context/smartspend-context.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Global React Context that wires together all 4 data domains
 * (dashboard, expenses, budgets, goals) into a single provider.
 *
 * Why a single context?
 *  - Dashboard data overlaps with budget/category data.
 *  - After adding an expense, both the expense list AND the dashboard
 *    KPIs need to refresh — a single refresh() achieves that.
 *  - Avoids prop-drilling across the layout → page → section component tree.
 *
 * Usage:
 *   <SmartSpendProvider>
 *     <Layout />                 ← wraps all (app) routes
 *   </SmartSpendProvider>
 *
 *   const { dashboard, addExpense } = useSmartSpend();
 */
'use client';

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from 'react';

import { useDashboard,  type DashboardData }           from '@/hooks/use-dashboard';
import { useExpenses,   type AddExpensePayload }        from '@/hooks/use-expenses';
import { useBudgets,    type UpsertBudgetPayload }      from '@/hooks/use-budgets';
import { useGoals,      type CreateGoalPayload }        from '@/hooks/use-goals';

import type { ExpenseDTO, BudgetSummaryDTO, GoalDTO }  from '@/types/api';

// ─── Context shape ────────────────────────────────────────────────────────────

interface SmartSpendContextValue {
  period: { year: number; month: number };
  setPeriod: (year: number, month: number) => void;

  // Dashboard
  dashboard:       DashboardData | null;
  dashboardLoading: boolean;
  dashboardError:  string | null;

  // Expenses
  expenses:        ExpenseDTO[];
  expensesLoading: boolean;
  expensesError:   string | null;
  submitting:      boolean;
  submitError:     string | null;
  addExpense:      (p: AddExpensePayload) => Promise<{
    expenseId:      string;
    autoCategized:  boolean;
    categorization: { categoryId: number; categoryName: string; confidence: string; matchedOn?: string };
  } | false>;

  // Budgets
  budget:          BudgetSummaryDTO | null;
  budgetLoading:   boolean;
  budgetError:     string | null;
  budgetSubmitting: boolean;
  budgetSubmitError: string | null;
  upsertBudget:    (p: UpsertBudgetPayload) => Promise<boolean>;

  // Goals
  goals:           GoalDTO[];
  goalsLoading:    boolean;
  goalsError:      string | null;
  goalSubmitting:  boolean;
  goalSubmitError: string | null;
  createGoal:      (p: CreateGoalPayload) => Promise<GoalDTO | null>;

  // Global
  refreshAll:      () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SmartSpendContext = createContext<SmartSpendContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface SmartSpendProviderProps {
  children:  ReactNode;
}

export function SmartSpendProvider({
  children,
}: SmartSpendProviderProps) {
  const now = new Date();
  const [period, setPeriodState] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const setPeriod = useCallback((year: number, month: number) => {
    setPeriodState({ year, month });
  }, []);

  // ── Individual hooks ──────────────────────────────────────────────────────
  const dashH = useDashboard({ ...period });
  const expH  = useExpenses({ ...period, limit: 100 });
  const budH  = useBudgets({ ...period });
  const goaH  = useGoals({ status: 'active' });

  // ── refreshAll — triggers all hooks simultaneously ─────────────────────────
  const refreshAll = useCallback(() => {
    dashH.refresh();
    expH.refresh();
    budH.refresh();
    goaH.refresh();
  }, [dashH.refresh, expH.refresh, budH.refresh, goaH.refresh]);

  // ── After adding an expense, refresh dashboard + budgets too ───────────────
  const addExpense = useCallback(
    async (payload: AddExpensePayload) => {
      const success = await expH.addExpense(payload);
      if (success) {
        dashH.refresh();
        budH.refresh();
      }
      return success;
    },
    [expH.addExpense, dashH.refresh, budH.refresh],
  );

  // ── After creating a goal, refresh dashboard ───────────────────────────────
  const createGoal = useCallback(
    async (payload: CreateGoalPayload) => {
      const result = await goaH.createGoal(payload);
      if (result) dashH.refresh();
      return result;
    },
    [goaH.createGoal, dashH.refresh],
  );

  // ── After upserting a budget, refresh dashboard too ───────────────────────
  const upsertBudget = useCallback(
    async (payload: UpsertBudgetPayload) => {
      const result = await budH.upsertBudget(payload);
      if (result) dashH.refresh();
      return result;
    },
    [budH.upsertBudget, dashH.refresh],
  );

  const value: SmartSpendContextValue = {
    period,
    setPeriod,

    dashboard:        dashH.data,
    dashboardLoading: dashH.loading,
    dashboardError:   dashH.error,

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

    refreshAll,
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

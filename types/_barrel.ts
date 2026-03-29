/**
 * types/index.ts — master re-export barrel
 * ─────────────────────────────────────────────────────────────────────
 * Central entry point for all TypeScript types in SmartSpend.
 *
 * Import strategy:
 *  - Domain models (User, Expense, Goal, Budget…) → default export from here
 *  - API DTOs / service payloads         → @/types/api
 *  - Engine output types                 → @/types/engine
 *  - UI prop helpers                     → @/types/ui
 *
 * This lets most files do:
 *   import type { Goal, Budget } from '@/types';
 * without knowing which file they actually live in.
 */

// ─── Domain models ────────────────────────────────────────────────────────────

export type { User, Expense, Budget, BudgetCategory, Goal,
              DashboardStats, ChartDataPoint, HealthScore }     from './index'; // (existing)

// ─── API layer ────────────────────────────────────────────────────────────────

export type {
  CategoryDTO,
  ExpenseDTO,
  CreateExpenseInput,
  GetExpensesQuery,
  BudgetCategoryDTO,
  BudgetSummaryDTO,
  UpsertBudgetInput,
  GoalDTO,
  CreateGoalInput,
  InsightDTO,
  InsightsSummaryDTO,
  ApiSuccess,
  ApiError,
  ApiResponse,
  GetBudgetsQuery,
  GetGoalsQuery,
  GetInsightsQuery,
  Priority,
  GoalStatus,
  InsightType,
}                                                               from './api';

// ─── Engine output types ──────────────────────────────────────────────────────

export type {
  InsightsEngineOutput,
  TextAdvice,
  AdviceSeverity,
  MetricDelta,
  WeekOverWeekComparison,
  MonthOverMonthComparison,
  GoalProbabilityResult,
  SpendingPattern,
}                                                               from './engine';


// ─── UI helpers ───────────────────────────────────────────────────────────────

export type {
  Variant, Size, ColorKey,
  NavItem,
  ToastVariant, ToastMessage,
  Column, PaginatedResult,
  SelectOption, FormFieldError,
}                                                               from './ui';

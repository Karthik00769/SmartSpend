/**
 * types/engine.ts
 * ─────────────────────────────────────────────────────────────────────
 * Re-exports engine-level types so pages/hooks import from '@/types/engine'
 * instead of reaching into lib/ internals.
 *
 * Usage: import type { InsightsEngineOutput, TextAdvice } from '@/types/engine';
 */

// ─── Expense engine ───────────────────────────────────────────────────────────

export type {
  RawExpenseInput,
  ProcessedExpense,
  ValidationResult,
  ValidationError,
  CategorizationResult,
  ExpenseEngineResult,
  SummaryBundle,
  MonthlySummary,
  WeeklySummary,
  CategorySummary,
  ChartBundle,
  PieDataPoint,
  BarDataPoint,
  TrendDataPoint,
} from '@/lib/expense-engine/types';


// ─── Insights engine ──────────────────────────────────────────────────────────

export type {
  InsightsEngineOutput,
  TextAdvice,
  AdviceSeverity,
  AdviceTag,
  MetricDelta,
  WeekOverWeekResult    as WeekOverWeekComparison,
  MonthOverMonthResult  as MonthOverMonthComparison,
  GoalProbabilityResult,
  GoalMilestone,
  GoalRisk,
  SpendingPattern,
  Period        as EnginePeriod,
  WeekPeriod,
  CategoryTrend,
} from '@/types/api';

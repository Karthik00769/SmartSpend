/**
 * types/api.ts
 * ─────────────────────────────────────────────────────────────────────
 * Canonical TypeScript types for every SmartSpend API request/response.
 * These are used by both the service layer and the route handlers, giving
 * a single source of truth throughout the backend.
 */

// ─── Shared primitives ──────────────────────────────────────────────────────

/** The three supported goal/insight priority levels */
export type Priority = 'low' | 'medium' | 'high';

/** Lifecycle status for a savings goal */
export type GoalStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

/** Goal planning horizon */
export type GoalType = 'short_term' | 'long_term';

/** Named insight categories produced by the AI/rules engine */
export type InsightType =
  | 'overspending_alert'
  | 'budget_exceeded'
  | 'goal_at_risk'
  | 'savings_opportunity'
  | 'unusual_transaction'
  | 'monthly_summary';



// ─── Category ────────────────────────────────────────────────────────────────

export interface CategoryDTO {
  id:       number;
  label:    string;
  icon:     string;
  color:    string;
  isSystem: boolean;
}

// ─── Expense ─────────────────────────────────────────────────────────────────

export interface ExpenseDTO {
  id:             string;
  userId:         string;
  categoryId:     number;
  categoryName:   string;
  categorySource?: 'manual' | 'auto';
  categoryIcon:   string;
  source:         string;   // 'manual' | 'receipt_scan' | 'bank_import'
  amount:         number;
  date:           string;
  description:    string;
  createdAt:      string;
}

export interface CreateExpenseInput {
  userId?:     string;
  category:    string;
  amount:      number;
  date:        string;
  description?: string;
}

/** Query params for GET /api/expenses */
export interface GetExpensesQuery {
  userId?:     string;
  year?:       number;
  month?:      number;
  limit?:      number;
  offset?:     number;
  search?:     string;
  startDate?:  string;
  endDate?:    string;
  minAmount?:  number;
  maxAmount?:  number;
  source?:     string;
  categoryId?: number;
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export interface BudgetCategoryDTO {
  id:          number;
  categoryId:  number;
  category:    string;        // human-readable label
  icon:        string;
  color:       string;
  allocated:   number;
  spent:       number;
  usedPct:     number | null;
  isOverBudget: boolean;
  remaining:   number;
  month:       number;
  year:        number;
}

export interface BudgetSummaryDTO {
  totalBudget: number;
  totalSpent:  number;
  categories:  BudgetCategoryDTO[];
}

/** Body sent to POST /api/budgets */
export interface UpsertBudgetInput {
  userId?:      string;
  category:     string;
  amount:       number;
  month:        number;
  year:         number;
}

// ─── Goal ────────────────────────────────────────────────────────────────────

export interface GoalDTO {
  id:                   number;
  userId:               string;
  title:                string;
  description:          string;
  targetAmount:         number;
  savedAmount:        number;
  deadline:             string;   // ISO date string
  priority:             Priority;
  status:               GoalStatus;
  goalType:             GoalType;
  completionPct:        number;
  daysRemaining:        number;
  requiredDailySavings: number | null;
  createdAt:            string;
}

/** Body sent to POST /api/goals */
export interface CreateGoalInput {
  userId?:      string;
  title:        string;
  description:  string;
  targetAmount: number;
  deadline:     string;
  priority:     Priority;
  goalType:     GoalType;
}

// ─── Insight ─────────────────────────────────────────────────────────────────

export interface InsightDTO {
  id:         number;
  type:       InsightType;
  content:    string;
  metadata:   Record<string, unknown> | null;
  isRead:     boolean;
  month:      number | null;
  year:       number | null;
  createdAt:  string;
  minutesAgo: number;
}

export interface InsightsSummaryDTO {
  unreadCount: number;
  insights:    InsightDTO[];
}

// ─── API envelope ────────────────────────────────────────────────────────────

/** Every successful API response is wrapped in this envelope */
export interface ApiSuccess<T> {
  ok:   true;
  data: T;
}

/** Every error  API response is wrapped in this envelope */
export interface ApiError {
  ok:      false;
  error:   string;
  details?: Record<string, string[]>;  // Zod field-level errors
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Query Payloads for Service Layer ────────────────────────────────────────

export interface GetBudgetsQuery {
  userId: string;
  month?: number;
  year?:  number;
}

export interface GetGoalsQuery {
  userId: string;
  status: string; // 'active' | 'paused' | 'completed' | 'cancelled'
}

export interface GetInsightsQuery {
  userId:      string;
  unreadOnly?: boolean;
}


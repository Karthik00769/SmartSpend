/**
 * lib/expense-engine/types.ts
 * ─────────────────────────────────────────────────────────────────────
 * All TypeScript types used internally by the Expense Processing Engine.
 * This is the engine's own type boundary — separate from the API DTO layer.
 */

// ─── Raw input (before validation) ───────────────────────────────────────────

/** The raw payload that arrives at the engine before any processing */
export interface EngineExpenseInput {
  userId?:     string | number;
  categoryId?: number | string;
  category?:   string;
  amountPaise: number;
  date:        string;
  description?: string;
  source?:     'manual' | 'receipt_scan' | 'bank_import';
}

// ─── Validated + enriched expense ────────────────────────────────────────────

/** Expense after validation, categorization, and enrichment — ready for DB insert */
export interface ProcessedExpense {
  userId:        string;
  categoryId:    number;       // resolved (auto-assigned or user-provided)
  amountPaise:   number;       // amount in paise
  date:          string;       // YYYY-MM-DD
  description:   string;
  week:          number;       // ISO week number (1-53)
  weekLabel:     string;       // "Week 11, 2026"
  month:         number;       // 1-12
  year:          number;
  dayOfWeek:     string;       // "Monday"
  autoCategized: boolean;      // was categoryId assigned by the engine?
  needsReview:   boolean;      // based on confidence engine
  confidenceScore: number;     // 0-100 overall confidence
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field:   string;
  message: string;
  value?:  unknown;
}

// ─── Category matching ────────────────────────────────────────────────────────

export interface CategoryRule {
  categoryId: number;
  name:       string;
  icon:       string;
  color:      string;
  keywords:   string[];          // lowercase keywords to match against description
}

export interface CategorizationResult {
  categoryId:   number;
  categoryName: string;
  confidence:   'exact' | 'keyword' | 'fallback' | 'ai_high' | 'ai_medium';
  matchedOn?:   string;          // which keyword triggered the match
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export interface MonthlySummary {
  year:             number;
  month:            number;
  label:            string;       // "March 2026"
  totalSpent:       number;
  transactionCount: number;
  dailyAvg:         number;
  income:           number;
  savings:          number;
  savingsRate:      number;       // 0-100 percentage
  topCategory:      string;
  topCategorySpend: number;
}

export interface WeeklySummary {
  weekNumber: number;
  weekLabel:  string;             // "Week 11, 2026"
  startDate:  string;             // YYYY-MM-DD (Monday)
  endDate:    string;             // YYYY-MM-DD (Sunday)
  totalSpent: number;
  txCount:    number;
  dailyAvg:   number;
  byDay:      DailySummary[];
}

export interface DailySummary {
  date:       string;             // YYYY-MM-DD
  dayLabel:   string;             // "Mon", "Tue", …
  totalSpent: number;
  txCount:    number;
}

export interface CategorySummary {
  categoryId:  number;
  name:        string;
  icon:        string;
  color:       string;
  totalSpent:  number;
  txCount:     number;
  avgAmount:   number;
  pctOfTotal:  number;           // 0-100
  budgetLimit: number;           // 0 if no budget set
  budgetUsed:  number;           // 0-100+ percentage
  isOverBudget: boolean;
}

// ─── Recharts-ready output ────────────────────────────────────────────────────

/** For Recharts <BarChart> and <LineChart> */
export interface BarDataPoint {
  name:       string;
  value:      number;
  fill?:      string;
  [key: string]: string | number | undefined;  // extra series (income, savings)
}

/** For Recharts <PieChart> */
export interface PieDataPoint {
  name:  string;
  value: number;
  fill:  string;
  icon:  string;
  pct:   number;
}

/** For Recharts <AreaChart> / <LineChart> — multi-series */
export interface TrendDataPoint {
  label:    string;   // "Jan 2026" or "Week 10"
  income:   number;
  expenses: number;
  savings:  number;
}

/** Recharts <BarChart> — spending by day of week */
export interface DayOfWeekDataPoint {
  day:   string;      // "Mon" … "Sun"
  total: number;
  count: number;
  avg:   number;
}

/** Consolidated chart payload — feed directly to dashboard components */
export interface ChartBundle {
  pieChart:      PieDataPoint[];        // category breakdown pie
  categoryBar:   BarDataPoint[];        // category bar chart
  monthlyTrend:  TrendDataPoint[];      // 6-month income vs expenses
  weeklyBar:     BarDataPoint[];        // week-by-week spending current month
  dailySpend:    BarDataPoint[];        // daily spending current month
  dayOfWeekHeat: DayOfWeekDataPoint[];  // Mon-Sun heat map
}

// ─── Engine output ────────────────────────────────────────────────────────────

/** Complete output of processExpense() — stored to DB + returned to caller */
export interface ExpenseEngineResult {
  processed:       ProcessedExpense;
  validation:      ValidationResult;
  categorization:  CategorizationResult;
  savedExpenseId?: string;
  savedExpense?:   any; // or ExpenseDTO
}

/** Complete output of generateSummaries() */
export interface SummaryBundle {
  monthly:    MonthlySummary;
  weekly:     WeeklySummary[];
  categories: CategorySummary[];
  charts:     ChartBundle;
}

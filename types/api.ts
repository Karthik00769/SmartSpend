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

/** Lifecycle status for a savings goal (database) */
export type GoalLifecycleStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

/** Computed status for a savings goal */
export type GoalStatus = 'on_track' | 'at_risk' | 'completed' | 'overdue';

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
  amountPaise:    number;
  date:           string;
  description:    string;
  createdAt:      string;
}

export interface CreateExpenseInput {
  userId?:     string;
  category:    string;
  amountPaise: number;
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
  minAmountPaise?: number;
  maxAmountPaise?: number;
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
  allocatedPaise: number;
  spentPaise:  number;
  usedPct:     number | null;
  isOverBudget: boolean;
  status:      'safe' | 'warning' | 'exceeded';
  needsAlert:  boolean;
  remainingPaise: number;
  month:       number;
  year:        number;
}

export interface BudgetSummaryDTO {
  totalBudgetPaise: number;
  totalSpentPaise:  number;
  categories:  BudgetCategoryDTO[];
}

/** Body sent to POST /api/budgets */
export interface UpsertBudgetInput {
  userId?:      string;
  category:     string;
  amountPaise:  number;
  month:        number;
  year:         number;
}

// ─── Goal ────────────────────────────────────────────────────────────────────

export interface GoalDTO {
  id:                   number;
  userId:               string;
  title:                string;
  description:          string;
  targetAmountPaise:    number;
  savedAmountPaise:   number;
  deadline:             string;   // ISO date string
  priority:             Priority;
  lifecycleStatus:      GoalLifecycleStatus;
  status:               GoalStatus;
  goalType:             GoalType;
  completionPct:        number;
  daysRemaining:        number;
  requiredDailySavingsPaise: number | null;
  progressPct:          number;
  remainingPaise:       number;
  isCompleted:          boolean;
  requiredMonthlySavingsPaise: number;
  createdAt:            string;
}

/** Body sent to POST /api/goals */
export interface CreateGoalInput {
  userId?:      string;
  title:        string;
  description:  string;
  targetAmountPaise: number;
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

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type AlertLevel = 'critical' | 'warning' | 'info' | 'success';

export interface SmartAlert {
  id:         string;
  level:      AlertLevel;
  emoji:      string;
  title:      string;
  detail:     string;
  href?:      string;
  hrefLabel?: string;
}

export interface MonthlyTrend {
  label: string;
  spentPaise: number;
}

export interface DashboardSummaryDTO {
  totalSpentPaise: number;
  totalIncomePaise: number;
  savingsPaise: number;
  savingsRate: number;
  monthlyGrowthPct: number;
  budgetCompliancePct: number;

  healthScore: number;
  healthStatus: string;

  topCategories: BudgetCategoryDTO[];
  recentExpenses: ExpenseDTO[];
  goals: GoalDTO[];
  recentInsights: InsightDTO[];
  monthlyTrend: MonthlyTrend[];
  alerts: SmartAlert[];
}

// ─── Insights Engine Types (Module 12) ─────────────────────────────────────────

export interface Period {
  year:  number;
  month: number;       // 1-12
}

export interface WeekPeriod {
  year:      number;
  weekNumber: number;  // ISO 1-53
  startDate: string;   // YYYY-MM-DD
  endDate:   string;
}

export type TrendDirection = 'up' | 'down' | 'stable' | 'new';

export interface MetricDelta {
  current:      number;
  previous:     number;
  absolute:     number;       
  percentage:   number;       
  direction:    TrendDirection;
  isSignificant: boolean;     
}

export interface CategoryTrend {
  categoryId:   number;
  categoryName: string;
  icon:         string;
  color:        string;
  delta:        MetricDelta;
  currentRank:  number;       
  previousRank: number;       
  rankChange:   number;       
}

export interface WeekOverWeekResult {
  currentWeek:  WeekPeriod;
  previousWeek: WeekPeriod;
  totalSpend:   MetricDelta;
  txCount:      MetricDelta;
  dailyAvg:     MetricDelta;
  categories:   CategoryTrend[];
  newCategories: string[];    
  goneCategories: string[];   
}

export interface MonthOverMonthResult {
  currentMonth:  Period;
  previousMonth: Period;
  totalSpend:    MetricDelta;
  txCount:       MetricDelta;
  dailyAvg:      MetricDelta;
  savings:       MetricDelta;
  savingsRate:   MetricDelta;
  categories:    CategoryTrend[];
}

export type AdviceSeverity = 'info' | 'positive' | 'warning' | 'critical';
export type AdviceTag =
  | 'spending_trend'
  | 'budget_alert'
  | 'savings_tip'
  | 'goal_progress'
  | 'category_spike'
  | 'streak'
  | 'summary';

export interface TextAdvice {
  id:          string;         
  severity:    AdviceSeverity;
  tag:         AdviceTag;
  headline:    string;         
  detail:      string;         
  emoji:       string;
  actionLabel?: string;        
  actionHref?:  string;        
  metadata:    Record<string, unknown>;
}

export type GoalRisk = 'on_track' | 'at_risk' | 'behind' | 'completed';

export interface GoalMilestone {
  pct:           number;    
  label:         string;    
  estimatedDate: string;    
  reached:       boolean;
}

export interface GoalProbabilityResult {
  goalId:               number;
  title:                string;
  targetAmountPaise:    number;
  savedAmountPaise:   number;
  targetDate:           string;
  daysRemaining:        number;
  requiredDailyAmountPaise: number;    
  actualDailyRatePaise: number;    
  projectedAmountPaise: number;    
  achievementPct:       number;    
  probability:          number;    
  risk:                 GoalRisk;
  weeksNeeded:          number;    
  recommendation:       string;
  milestones:           GoalMilestone[];
}

export interface SpendingPattern {
  peakDayOfWeek:  string;    
  lowestDayOfWeek: string;
  peakWeekOfMonth: number;   
  avgTransactionSizePaise: number;
  largestTransactionPaise: number;
  mostFrequentCategory: string;
  streakDaysUnderBudget: number;  
}

export interface MonthlyBreakdown {
  year:       number;
  month:      number;
  label:      string;   
  totalSpentPaise: number;
  savingsPaise:    number;
  savingsRate: number;
}

export interface TopCategory {
  categoryName:      string;
  icon:              string;
  color:             string;
  totalPaise:        number;
  percentageOfTotal: number;
}

export interface CategoryTrendSummary {
  categoryName: string;
  icon:         string;
  trend:        'increasing' | 'decreasing' | 'stable' | 'new';
  trendPct:     number;   
  currentSpendPaise: number;
  prevSpendPaise:    number;
}

export interface SpendingAnomaly {
  categoryName: string;
  icon:         string;
  currentSpendPaise: number;
  avgPrevSpendPaise: number;   
  spikeRatio:   number;   
  message:      string;
}

export interface SavingsAnalysis {
  incomePaise:  number;
  totalSpentPaise: number;
  savingsPaise: number;
  savingsRate:  number;
  classification: 'low' | 'moderate' | 'good';
}

/** Precomputed state used by AI to generate text insights. No raw expenses allowed. */
export interface InsightContextDTO {
  generatedAt:       string;          
  period:            Period;
  weekOverWeek:      WeekOverWeekResult | null;
  monthOverMonth:    MonthOverMonthResult;
  goalProbabilities: GoalProbabilityResult[];
  pattern:           SpendingPattern;
  score: {
    overall:          number;   
    savingsRate:      number;   
    budgetCompliance: number;   
    goalProgress:     number;   
    spendingControl:  number;   
  };
  topCategories:    TopCategory[];
  categoryTrends:   CategoryTrendSummary[];
  anomalies:        SpendingAnomaly[];
  savingsAnalysis:  SavingsAnalysis;
  monthlyBreakdown: MonthlyBreakdown[]; 
}

/** Complete payload for the UI. */
export interface InsightsEngineOutput {
  generatedAt:       string;
  period:            Period;
  weekOverWeek:      WeekOverWeekResult | null;
  monthOverMonth:    MonthOverMonthResult;
  goalProbabilities: GoalProbabilityResult[];
  advice:            TextAdvice[];
  pattern:           SpendingPattern;
  score: {
    overall:          number;   
    savingsRate:      number;   
    budgetCompliance: number;   
    goalProgress:     number;   
    spendingControl:  number;   
  };
  topCategories:    TopCategory[];
  categoryTrends:   CategoryTrendSummary[];
  anomalies:        SpendingAnomaly[];
  savingsAnalysis:  SavingsAnalysis;
  aiSuggestions:    string | null;   
  monthlyBreakdown: MonthlyBreakdown[]; 
}

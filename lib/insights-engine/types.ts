/**
 * lib/insights-engine/types.ts
 * ─────────────────────────────────────────────────────────────────────
 * All TypeScript types for the SmartSpend Insights Engine.
 * Separate from the Expense Engine types — this layer is about
 * analysis, text generation, and probabilistic scoring.
 */

// ─── Period definitions ───────────────────────────────────────────────────────

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

// ─── Trend analysis ───────────────────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'stable' | 'new';

/** A single metric compared between two periods */
export interface MetricDelta {
  current:      number;
  previous:     number;
  absolute:     number;       // current - previous (can be negative)
  percentage:   number;       // ((current - previous) / previous) * 100
  direction:    TrendDirection;
  isSignificant: boolean;     // |percentage| > threshold (default 5%)
}

/** Spending trend for one category across two periods */
export interface CategoryTrend {
  categoryId:   number;
  categoryName: string;
  icon:         string;
  color:        string;
  delta:        MetricDelta;
  currentRank:  number;       // rank by spend in current period (1 = highest)
  previousRank: number;       // rank in previous period (0 = was absent)
  rankChange:   number;       // negative = moved up, positive = moved down
}

/** Full week-over-week comparison result */
export interface WeekOverWeekResult {
  currentWeek:  WeekPeriod;
  previousWeek: WeekPeriod;
  totalSpend:   MetricDelta;
  txCount:      MetricDelta;
  dailyAvg:     MetricDelta;
  categories:   CategoryTrend[];
  newCategories: string[];    // appeared this week but not last week
  goneCategories: string[];   // appeared last week but not this week
}

/** Full month-over-month comparison result */
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

// ─── Text advice ──────────────────────────────────────────────────────────────

export type AdviceSeverity = 'info' | 'positive' | 'warning' | 'critical';
export type AdviceTag =
  | 'spending_trend'
  | 'budget_alert'
  | 'savings_tip'
  | 'goal_progress'
  | 'category_spike'
  | 'streak'
  | 'summary';

/** One piece of generated textual advice */
export interface TextAdvice {
  id:          string;         // deterministic key for dedup
  severity:    AdviceSeverity;
  tag:         AdviceTag;
  headline:    string;         // short (≤60 chars) — for card title
  detail:      string;         // full sentence — for card body
  emoji:       string;
  actionLabel?: string;        // CTA button label ("Set budget", "Add savings")
  actionHref?:  string;        // CTA target route
  metadata:    Record<string, unknown>;
}

// ─── Goal probability ─────────────────────────────────────────────────────────

export type GoalRisk = 'on_track' | 'at_risk' | 'behind' | 'completed';

export interface GoalProbabilityResult {
  goalId:               number;
  title:                string;
  targetAmount:         number;
  currentAmount:        number;
  targetDate:           string;
  daysRemaining:        number;
  requiredDailyAmount:  number;    // required per day to hit goal
  actualDailyRate:      number;    // average daily savings based on history
  projectedAmount:      number;    // projected total by target date at current rate
  achievementPct:       number;    // projected / target * 100
  probability:          number;    // 0-100 score
  risk:                 GoalRisk;
  weeksNeeded:          number;    // at current rate, weeks to reach target
  recommendation:       string;
  milestones:           GoalMilestone[];
}

export interface GoalMilestone {
  pct:           number;    // 25, 50, 75, 100
  label:         string;    // "Quarter way there!"
  estimatedDate: string;    // YYYY-MM-DD at current save rate
  reached:       boolean;
}

// ─── Spending pattern ─────────────────────────────────────────────────────────

export interface SpendingPattern {
  peakDayOfWeek:  string;    // day with highest avg spending
  lowestDayOfWeek: string;
  peakWeekOfMonth: number;   // 1-4 which week has highest avg
  avgTransactionSize: number;
  largestTransaction: number;
  mostFrequentCategory: string;
  streakDaysUnderBudget: number;  // consecutive days without going over daily limit
}

// ─── Full engine output ───────────────────────────────────────────────────────

/** The complete output of runInsightsEngine() */
export interface InsightsEngineOutput {
  generatedAt:       string;          // ISO timestamp
  period:            Period;
  weekOverWeek:      WeekOverWeekResult | null;
  monthOverMonth:    MonthOverMonthResult;
  goalProbabilities: GoalProbabilityResult[];
  advice:            TextAdvice[];
  pattern:           SpendingPattern;
  score: {
    overall:          number;   // 0-100 financial health score
    savingsRate:      number;   // sub-score
    budgetCompliance: number;   // sub-score
    goalProgress:     number;   // sub-score
    spendingControl:  number;   // sub-score
  };
}

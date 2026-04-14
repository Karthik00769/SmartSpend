/**
 * lib/insights-engine/text-generator.ts
 * ─────────────────────────────────────────────────────────────────────
 * Converts structured comparison data into human-readable advice cards.
 *
 * Design principles:
 *  - Advice is deterministic: same input → same output (no LLM randomness)
 *  - Advice IDs are stable hashes so the UI can dedup across refreshes
 *  - Each advice has severity (info/positive/warning/critical) for styling
 *  - Copy is specific with real numbers: "Food up $28 (15% this week)"
 *
 * Pure module — no DB calls, no side-effects.
 */

import type {
  TextAdvice,
  AdviceSeverity,
  AdviceTag,
  WeekOverWeekResult,
  MonthOverMonthResult,
  GoalProbabilityResult,
  SpendingPattern,
  MetricDelta,
} from './types';
import type { MonthlySummary } from '@/lib/expense-engine/types';
import { directionPhrase, formatDelta } from './comparator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = (n: number) => `$${Math.abs(n).toLocaleString('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})}`;

/** Stable deterministic ID — same inputs always → same ID */
function makeId(tag: string, key: string): string {
  return `${tag}:${key}`.replace(/\s+/g, '_').toLowerCase();
}

function advice(
  tag:      AdviceTag,
  key:      string,
  severity: AdviceSeverity,
  emoji:    string,
  headline: string,
  detail:   string,
  meta:     Record<string, unknown> = {},
  action?:  { label: string; href: string },
): TextAdvice {
  return {
    id: makeId(tag, key),
    severity,
    tag,
    headline,
    detail,
    emoji,
    actionLabel: action?.label,
    actionHref:  action?.href,
    metadata: meta,
  };
}

// ─── Week-over-week advice ────────────────────────────────────────────────────

/**
 * generateWeekAdvice
 * Generates advice cards from a WeekOverWeekResult.
 */
export function generateWeekAdvice(wow: WeekOverWeekResult): TextAdvice[] {
  const cards: TextAdvice[] = [];

  // ── 1. Overall week spend change ─────────────────────────────────────────
  const spend = wow.totalSpend;
  if (spend.isSignificant) {
    const more = spend.direction === 'up';
    cards.push(advice(
      'spending_trend',
      `wow_total_${wow.currentWeek.weekNumber}`,
      more ? 'warning' : 'positive',
      more ? '📈' : '📉',
      `Weekly spending ${more ? 'up' : 'down'} ${Math.abs(spend.percentage)}%`,
      `You spent ${$(spend.current)} this week — ${directionPhrase(spend)} vs last week (${$(spend.previous)}).${
        more
          ? ' Try reviewing your largest categories to find savings.'
          : ' Great discipline — keep it up!'
      }`,
      { current: spend.current, previous: spend.previous, pct: spend.percentage },
      more ? { label: 'Review expenses', href: '/expenses' } : undefined,
    ));
  }

  // ── 2. Category spikes ───────────────────────────────────────────────────
  const topMover = wow.categories.find(
    c => c.delta.isSignificant && c.delta.direction === 'up' && c.categoryId !== 9,
  );
  if (topMover) {
    cards.push(advice(
      'category_spike',
      `wow_cat_spike_${topMover.categoryId}`,
      'warning',
      topMover.icon,
      `${topMover.categoryName} spending increased ${Math.abs(topMover.delta.percentage)}%`,
      `Your ${topMover.categoryName} spend rose from ${$(topMover.delta.previous)} to ${$(topMover.delta.current)} this week — ${formatDelta(topMover.delta)} vs last week.`,
      { category: topMover.categoryName, delta: topMover.delta },
      { label: 'Set a budget', href: '/budgets' },
    ));
  }

  // ── 3. Category wins (dropped significantly) ─────────────────────────────
  const bigDrop = wow.categories.find(
    c => c.delta.isSignificant && c.delta.direction === 'down' && c.delta.percentage < -15,
  );
  if (bigDrop) {
    cards.push(advice(
      'spending_trend',
      `wow_cat_drop_${bigDrop.categoryId}`,
      'positive',
      '🎉',
      `${bigDrop.categoryName} spending down ${Math.abs(bigDrop.delta.percentage)}%`,
      `You cut ${bigDrop.categoryName} spending from ${$(bigDrop.delta.previous)} to ${$(bigDrop.delta.current)} — saving ${$(Math.abs(bigDrop.delta.absolute))} this week!`,
      { category: bigDrop.categoryName, saved: Math.abs(bigDrop.delta.absolute) },
    ));
  }

  // ── 4. New spending categories noticed ────────────────────────────────────
  if (wow.newCategories.length > 0) {
    const list = wow.newCategories.join(', ');
    cards.push(advice(
      'spending_trend',
      `wow_new_cats_${wow.currentWeek.weekNumber}`,
      'info',
      '🆕',
      `New spending areas this week`,
      `You have new expenses in: ${list}. These didn't appear last week.`,
      { categories: wow.newCategories },
    ));
  }

  return cards;
}

// ─── Month-over-month advice ──────────────────────────────────────────────────

/**
 * generateMonthAdvice
 * Generates advice cards from a MonthOverMonthResult + current MonthlySummary.
 */
export function generateMonthAdvice(
  mom:     MonthOverMonthResult,
  summary: MonthlySummary,
): TextAdvice[] {
  const cards: TextAdvice[] = [];
  const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const currentLabel = MONTH_NAMES[mom.currentMonth.month];

  // ── 1. Monthly spend summary ──────────────────────────────────────────────
  cards.push(advice(
    'summary',
    `mom_summary_${mom.currentMonth.year}_${mom.currentMonth.month}`,
    summary.savingsRate >= 20 ? 'positive' : summary.savingsRate >= 10 ? 'info' : 'warning',
    summary.savingsRate >= 20 ? '💰' : '📊',
    `${currentLabel} summary: ${$(summary.totalSpent)} spent`,
    `You spent ${$(summary.totalSpent)} in ${currentLabel} — saving ${$(summary.savings)} (${summary.savingsRate}% savings rate). Top category: ${summary.topCategory} at ${$(summary.topCategorySpend)}.`,
    { totalSpent: summary.totalSpent, savings: summary.savings, savingsRate: summary.savingsRate },
  ));

  // ── 2. Month-over-month total ─────────────────────────────────────────────
  const spend = mom.totalSpend;
  if (spend.isSignificant) {
    const up = spend.direction === 'up';
    cards.push(advice(
      'spending_trend',
      `mom_total_${mom.currentMonth.year}_${mom.currentMonth.month}`,
      up ? 'warning' : 'positive',
      up ? '📈' : '📉',
      `Monthly spend ${up ? 'up' : 'down'} ${Math.abs(spend.percentage)}% vs last month`,
      `This month: ${$(spend.current)} vs ${$(spend.previous)} last month. That's ${up ? 'an extra' : 'a saving of'} ${$(Math.abs(spend.absolute))}.`,
      { current: spend.current, previous: spend.previous },
    ));
  }

  // ── 3. Savings rate change ────────────────────────────────────────────────
  const sr = mom.savingsRate;
  if (sr.isSignificant) {
    const improved = sr.direction === 'up';
    cards.push(advice(
      'savings_tip',
      `mom_savings_${mom.currentMonth.year}_${mom.currentMonth.month}`,
      improved ? 'positive' : sr.current < 10 ? 'critical' : 'warning',
      improved ? '🏦' : '⚠️',
      `Savings rate ${improved ? 'improved' : 'dropped'} to ${sr.current}%`,
      improved
        ? `Your savings rate improved from ${sr.previous}% to ${sr.current}% — that's ${$(summary.savings)} saved this month!`
        : `Your savings rate fell from ${sr.previous}% to ${sr.current}%. Consider reducing ${summary.topCategory} spending to get back on track.`,
      { currentRate: sr.current, previousRate: sr.previous, savings: summary.savings },
      !improved ? { label: 'View budgets', href: '/budgets' } : undefined,
    ));
  } else if (summary.savingsRate < 5) {
    cards.push(advice(
      'savings_tip',
      `mom_low_savings_${mom.currentMonth.year}_${mom.currentMonth.month}`,
      'critical',
      '🚨',
      `Savings rate critically low at ${summary.savingsRate}%`,
      `You're saving less than 5% of your income this month. A target of 20% is recommended. Try reducing ${summary.topCategory} expenses first.`,
      { savingsRate: summary.savingsRate },
      { label: 'Review spending', href: '/expenses' },
    ));
  }

  // ── 4. Top category spikes ────────────────────────────────────────────────
  const topSpiked = mom.categories.find(
    c => c.delta.direction === 'up' && c.delta.percentage > 20 && c.currentRank <= 3,
  );
  if (topSpiked) {
    cards.push(advice(
      'category_spike',
      `mom_cat_spike_${topSpiked.categoryId}_${mom.currentMonth.month}`,
      'warning',
      topSpiked.icon,
      `${topSpiked.categoryName} spending spiked ${topSpiked.delta.percentage}% this month`,
      `${topSpiked.categoryName}: ${$(topSpiked.delta.current)} this month vs ${$(topSpiked.delta.previous)} last month. Consider setting a budget limit.`,
      { category: topSpiked.categoryName, ...topSpiked.delta },
      { label: 'Set budget', href: '/budgets' },
    ));
  }

  return cards;
}

// ─── Goal advice ──────────────────────────────────────────────────────────────

/**
 * generateGoalAdvice
 * Generates one advice card per active savings goal.
 */
export function generateGoalAdvice(goals: GoalProbabilityResult[]): TextAdvice[] {
  return goals.map(g => {
    const pct    = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
    const needed = $(g.requiredDailyAmount);

    if (g.risk === 'completed') {
      return advice(
        'goal_progress',
        `goal_done_${g.goalId}`,
        'positive', '🏆',
        `Goal complete: "${g.title}"`,
        `You've reached your ${$(g.targetAmount)} goal for "${g.title}". Time to set a new one!`,
        { goalId: g.goalId },
        { label: 'Add new goal', href: '/goals' },
      );
    }

    if (g.risk === 'on_track') {
      return advice(
        'goal_progress',
        `goal_track_${g.goalId}`,
        'positive', '✅',
        `"${g.title}" — on track (${pct}% complete)`,
        `You're ${pct}% of the way to ${$(g.targetAmount)}. At your current rate of ${$(g.actualDailyRate)}/day you'll hit your target on time. Keep it up!`,
        { goalId: g.goalId, pct, probability: g.probability },
      );
    }

    if (g.risk === 'at_risk') {
      return advice(
        'goal_progress',
        `goal_risk_${g.goalId}`,
        'warning', '⏳',
        `"${g.title}" at risk — ${g.daysRemaining} days left, ${pct}% done`,
        `You need ${needed}/day to hit ${$(g.targetAmount)} by your deadline. Currently saving ${$(g.actualDailyRate)}/day. Boost daily savings by ${$(g.requiredDailyAmount - g.actualDailyRate)} to stay on track.`,
        { goalId: g.goalId, pct, required: g.requiredDailyAmount, actual: g.actualDailyRate },
        { label: 'Update goal', href: '/goals' },
      );
    }

    // behind
    return advice(
      'goal_progress',
      `goal_behind_${g.goalId}`,
      'critical', '🚩',
      `"${g.title}" — off track, only ${g.probability}% likely to succeed`,
      `At your current saving rate of ${$(g.actualDailyRate)}/day, you'll only reach ${$(g.projectedAmount)} by your ${g.targetDate} deadline (${pct}% of ${$(g.targetAmount)}). You need ${needed}/day to catch up.`,
      { goalId: g.goalId, pct, projected: g.projectedAmount, probability: g.probability },
      { label: 'Adjust goal', href: '/goals' },
    );
  });
}

// ─── Budget alerts ────────────────────────────────────────────────────────────

/**
 * generateBudgetAlerts
 * Generates budget overage alerts from category summaries.
 */
export function generateBudgetAlerts(
  categories: { name: string; icon: string; isOverBudget: boolean; budgetLimit: number; totalSpent: number; budgetUsed: number }[],
): TextAdvice[] {
  const alerts: TextAdvice[] = [];

  for (const cat of categories) {
    if (!cat.budgetLimit) continue;

    if (cat.isOverBudget) {
      const overBy = cat.totalSpent - cat.budgetLimit;
      alerts.push(advice(
        'budget_alert',
        `budget_over_${cat.name}`,
        'critical', '🚨',
        `${cat.name} budget exceeded by ${$(overBy)}`,
        `You've spent ${$(cat.totalSpent)} on ${cat.name} — ${$(overBy)} over your ${$(cat.budgetLimit)} budget (${Math.round(cat.budgetUsed)}% used). Avoid further ${cat.name} spending this month.`,
        { category: cat.name, spent: cat.totalSpent, limit: cat.budgetLimit, overBy },
        { label: 'Adjust budget', href: '/budgets' },
      ));
    } else if (cat.budgetUsed >= 80) {
      const remaining = cat.budgetLimit - cat.totalSpent;
      alerts.push(advice(
        'budget_alert',
        `budget_warn_${cat.name}`,
        'warning', '⚠️',
        `${cat.name} at ${Math.round(cat.budgetUsed)}% of budget`,
        `You've used ${$(cat.totalSpent)} of your ${$(cat.budgetLimit)} ${cat.name} budget. Only ${$(remaining)} remaining — spend carefully.`,
        { category: cat.name, remaining, pct: cat.budgetUsed },
      ));
    }
  }

  return alerts;
}

// ─── Forecast alerts ──────────────────────────────────────────────────────────

import type { ForecastResult } from './forecaster';

/**
 * generateForecastAlerts
 * Generates advice cards forecasting whether a category is trending over budget.
 */
export function generateForecastAlerts(forecasts: ForecastResult[]): TextAdvice[] {
  const cards: TextAdvice[] = [];

  for (const f of forecasts) {
    if (f.isOverBudgetRisk && f.currentSpent < f.budgetLimit) {
      cards.push(advice(
        'budget_alert',
        `forecast_over_${f.category}`,
        'warning', '⚠️',
        `${f.category} heading over budget!`,
        `Based on current spending, you are projected to spend $${f.projectedSpent} on ${f.category} this month. Limit $${f.budgetLimit}. Try reducing purchases to save $${Math.abs(f.bufferAmount)}.`,
        { category: f.category, projected: f.projectedSpent, limit: f.budgetLimit },
        { label: 'View budgets', href: '/budgets' }
      ));
    }
  }

  return cards;
}

// ─── Pattern-based tips ───────────────────────────────────────────────────────

/**
 * generatePatternTips
 * Generates generic tips based on detected spending patterns.
 */
export function generatePatternTips(
  pattern:          SpendingPattern,
  monthlySummary:   MonthlySummary,
): TextAdvice[] {
  const tips: TextAdvice[] = [];

  // Peak day tip
  if (pattern.peakDayOfWeek) {
    tips.push(advice(
      'savings_tip',
      `pattern_peak_day_${pattern.peakDayOfWeek}`,
      'info', '📅',
      `You spend the most on ${pattern.peakDayOfWeek}s`,
      `Your average spend on ${pattern.peakDayOfWeek}s is higher than other days. Plan ahead to reduce impulse purchases on this day.`,
      { peakDay: pattern.peakDayOfWeek },
    ));
  }

  // Streak tip
  if (pattern.streakDaysUnderBudget >= 3) {
    tips.push(advice(
      'streak',
      `streak_${pattern.streakDaysUnderBudget}`,
      'positive', '🔥',
      `${pattern.streakDaysUnderBudget}-day on-budget streak!`,
      `You've been under your daily budget for ${pattern.streakDaysUnderBudget} days in a row. Keep the momentum going!`,
      { streak: pattern.streakDaysUnderBudget },
    ));
  }

  // Large transaction warning
  if (pattern.largestTransaction > monthlySummary.dailyAvg * 5) {
    tips.push(advice(
      'spending_trend',
      `large_tx_${Math.round(pattern.largestTransaction)}`,
      'info', '💸',
      `One transaction was ${$(pattern.largestTransaction)}`,
      `Your largest single transaction this month was ${$(pattern.largestTransaction)} — ${Math.round(pattern.largestTransaction / monthlySummary.dailyAvg)}x your daily average. Large one-offs can distort your monthly picture.`,
      { largestTx: pattern.largestTransaction, dailyAvg: monthlySummary.dailyAvg },
    ));
  }

  return tips;
}

// ─── Score-based headline ─────────────────────────────────────────────────────

/** Generate a single score summary card */
export function generateScoreCard(score: {
  overall: number;
  savingsRate: number;
  budgetCompliance: number;
  goalProgress: number;
  spendingControl: number;
}): TextAdvice {
  const grade = score.overall >= 80 ? 'Excellent' :
                score.overall >= 60 ? 'Good'      :
                score.overall >= 40 ? 'Fair'       : 'Needs attention';

  const severity: AdviceSeverity =
    score.overall >= 80 ? 'positive' :
    score.overall >= 60 ? 'info'     :
    score.overall >= 40 ? 'warning'  : 'critical';

  return advice(
    'summary',
    `score_card_${score.overall}`,
    severity,
    score.overall >= 80 ? '⭐' : score.overall >= 60 ? '📊' : '📉',
    `Financial Health Score: ${score.overall}/100 — ${grade}`,
    `Savings rate: ${score.savingsRate}/100 · Budget compliance: ${score.budgetCompliance}/100 · Goal progress: ${score.goalProgress}/100 · Spending control: ${score.spendingControl}/100`,
    { ...score },
  );
}

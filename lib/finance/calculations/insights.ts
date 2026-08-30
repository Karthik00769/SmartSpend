import type {
  GoalProbabilityResult,
  GoalMilestone,
  GoalRisk,
  MetricDelta,
  TrendDirection,
  CategoryTrend,
  WeekOverWeekResult,
  MonthOverMonthResult,
  WeekPeriod,
  Period,
  SpendingPattern,
  CategoryTrendSummary,
  SpendingAnomaly,
  TopCategory,
  SavingsAnalysis,
  MonthlyBreakdown
} from '@/types/api';

import type { ExpenseDTO, GoalDTO } from '@/types/api';
import type { CategorySummary, MonthlySummary } from '@/lib/expense-engine/types';
import { Analytics, Goals, Math as FinanceMath } from '@/lib/finance';
import { getCategoryMeta } from '@/lib/expense-engine/categorizer';

// ─── Scorer ───────────────────────────────────────────────────────────────────

export function savingsRateScore(savingsRate: number): number {
  if (savingsRate <= 0)  return 0;
  if (savingsRate >= 40) return 100;
  if (savingsRate <= 20) return Math.round((savingsRate / 20) * 70);
  return Math.round(70 + ((savingsRate - 20) / 20) * 30);
}

export function budgetComplianceScore(categories: CategorySummary[]): number {
  const budgetedCats = categories.filter(c => c.budgetLimit > 0);
  if (budgetedCats.length === 0) return 0;

  let totalScore = 0;
  for (const cat of budgetedCats) {
    if (!cat.isOverBudget) {
      if (cat.budgetUsed <= 80) totalScore += 100;
      else totalScore += Math.round(100 - (cat.budgetUsed - 80) * 2);
    } else {
      const overPct = cat.budgetUsed - 100;
      totalScore += Math.max(0, 60 - overPct);
    }
  }
  return Math.round(totalScore / budgetedCats.length);
}

export function goalProgressScore(goals: GoalProbabilityResult[]): number {
  if (goals.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const goal of goals) {
    const weight = goal.probability >= 70 ? 2 : goal.probability >= 40 ? 1.5 : 1;
    weightedSum += goal.probability * weight;
    totalWeight += weight;
  }
  return Math.round(weightedSum / totalWeight);
}

export function spendingControlScore(
  summary: MonthlySummary,
  mom:     MonthOverMonthResult,
): number {
  if (summary.transactionCount === 0) return 0;
  let score = 80;

  if (mom.totalSpend.direction === 'up' && mom.totalSpend.isSignificant) {
    score -= Math.min(30, Math.abs(mom.totalSpend.percentage) / 2);
  }
  if (mom.totalSpend.direction === 'down' && mom.totalSpend.isSignificant) {
    score += Math.min(20, Math.abs(mom.totalSpend.percentage) / 2);
  }
  if (summary.savings <= 0) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface HealthScore {
  overall:          number;
  savingsRate:      number;
  budgetCompliance: number;
  goalProgress:     number;
  spendingControl:  number;
}

export function computeHealthScore(params: {
  summary:    MonthlySummary;
  categories: CategorySummary[];
  goals:      GoalProbabilityResult[];
  mom:        MonthOverMonthResult;
}): HealthScore {
  const { summary, categories, goals, mom } = params;
  const srScore  = savingsRateScore(summary.savingsRate);
  const bcScore  = budgetComplianceScore(categories);
  const gpScore  = goalProgressScore(goals);
  const scScore  = spendingControlScore(summary, mom);

  const overall = Math.round(
    srScore * 0.35 +
    bcScore * 0.25 +
    gpScore * 0.25 +
    scScore * 0.15,
  );

  return {
    overall:          Math.max(0, Math.min(100, overall)),
    savingsRate:      srScore,
    budgetCompliance: bcScore,
    goalProgress:     gpScore,
    spendingControl:  scScore,
  };
}


// ─── Comparator ───────────────────────────────────────────────────────────────

const SIGNIFICANCE_THRESHOLD = 5;

export function calcDelta(current: number, previous: number): MetricDelta {
  const absolute   = current - previous;
  let   percentage = 0;
  let   direction: TrendDirection = 'stable';

  if (previous === 0 && current === 0) {
    direction  = 'stable';
    percentage = 0;
  } else if (previous === 0 && current > 0) {
    direction  = 'new';
    percentage = 100;
  } else {
    percentage = Analytics.calculateGrowthPct(current, previous);
    if (Math.abs(percentage) < SIGNIFICANCE_THRESHOLD) direction = 'stable';
    else if (current > previous)                        direction = 'up';
    else                                                direction = 'down';
  }

  return {
    current,
    previous,
    absolute:      Math.round(absolute  * 100) / 100,
    percentage:    Math.round(percentage * 10)  / 10,
    direction,
    isSignificant: Math.abs(percentage) >= SIGNIFICANCE_THRESHOLD,
  };
}

export function compareCategoryLists(
  current:  CategorySummary[],
  previous: CategorySummary[],
): {
  trends:      CategoryTrend[];
  newCats:     string[];
  goneCats:    string[];
} {
  const prevMap = new Map<number, CategorySummary>(
    previous.map(c => [c.categoryId, c]),
  );
  const currMap = new Map<number, CategorySummary>(
    current.map(c => [c.categoryId, c]),
  );

  const trends: CategoryTrend[] = [];
  const allIds = new Set([...currMap.keys(), ...prevMap.keys()]);

  for (const id of allIds) {
    const curr = currMap.get(id);
    const prev = prevMap.get(id);
    const meta = getCategoryMeta(id);

    const currentSpend  = curr?.totalSpent  ?? 0;
    const previousSpend = prev?.totalSpent  ?? 0;
    const currentRank   = curr ? current.indexOf(curr)  + 1 : 0;
    const previousRank  = prev ? previous.indexOf(prev) + 1 : 0;

    trends.push({
      categoryId:   id,
      categoryName: meta.name,
      icon:         meta.icon,
      color:        meta.color,
      delta:        calcDelta(currentSpend, previousSpend),
      currentRank,
      previousRank,
      rankChange:   currentRank > 0 && previousRank > 0 ? currentRank - previousRank : 0,
    });
  }

  trends.sort((a, b) => Math.abs(b.delta.absolute) - Math.abs(a.delta.absolute));

  const newCats  = [...currMap.keys()]
    .filter(id => !prevMap.has(id))
    .map(id => getCategoryMeta(id).name);

  const goneCats = [...prevMap.keys()]
    .filter(id => !currMap.has(id))
    .map(id => getCategoryMeta(id).name);

  return { trends, newCats, goneCats };
}

export function buildWeekOverWeek(
  currentExpenses:  ExpenseDTO[],
  previousExpenses: ExpenseDTO[],
  currentWeek:      WeekPeriod,
  previousWeek:     WeekPeriod,
  currentCats:      CategorySummary[],
  previousCats:     CategorySummary[],
): WeekOverWeekResult {
  const currTotal = currentExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const prevTotal = previousExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const { trends, newCats, goneCats } = compareCategoryLists(currentCats, previousCats);

  return {
    currentWeek,
    previousWeek,
    totalSpend: calcDelta(currTotal, prevTotal),
    txCount:    calcDelta(currentExpenses.length,  previousExpenses.length),
    dailyAvg:   calcDelta(currTotal / 7,            prevTotal / 7),
    categories: trends,
    newCategories:  newCats,
    goneCategories: goneCats,
  };
}

export function buildMonthOverMonth(
  currentSummary:  MonthlySummary,
  previousSummary: MonthlySummary,
  currentCats:     CategorySummary[],
  previousCats:    CategorySummary[],
  currentPeriod:   Period,
  previousPeriod:  Period,
): MonthOverMonthResult {
  const { trends } = compareCategoryLists(currentCats, previousCats);

  return {
    currentMonth:  currentPeriod,
    previousMonth: previousPeriod,
    totalSpend:  calcDelta(currentSummary.totalSpent,  previousSummary.totalSpent),
    txCount:     calcDelta(currentSummary.transactionCount, previousSummary.transactionCount),
    dailyAvg:    calcDelta(currentSummary.dailyAvg,    previousSummary.dailyAvg),
    savings:     calcDelta(currentSummary.savings,     previousSummary.savings),
    savingsRate: calcDelta(currentSummary.savingsRate, previousSummary.savingsRate),
    categories:  trends,
  };
}

export function formatDelta(delta: MetricDelta): string {
  if (delta.direction === 'stable') return '~0%';
  if (delta.direction === 'new')    return '+100% (new)';
  const sign = delta.percentage > 0 ? '+' : '';
  return `${sign}${delta.percentage}%`;
}

export function directionPhrase(delta: MetricDelta): string {
  switch (delta.direction) {
    case 'up':     return `increased ${Math.abs(delta.percentage)}%`;
    case 'down':   return `decreased ${Math.abs(delta.percentage)}%`;
    case 'new':    return `appeared for the first time`;
    case 'stable': return `stayed roughly the same`;
  }
}


// ─── Goal Analyzer ────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function logisticScore(ratio: number): number {
  const k = 5;
  const raw = 1 / (1 + Math.exp(-k * (ratio - 0.75)));
  return Math.round(raw * 100);
}

const MILESTONE_PCTS = [25, 50, 75, 100] as const;
const MILESTONE_LABELS: Record<number, string> = {
  25:  'Quarter way there! 🎯',
  50:  'Halfway milestone! 🌟',
  75:  'Almost there — 75%! 💪',
  100: 'Goal achieved! 🏆',
};

export function analyzeGoal(
  goal:            GoalDTO,
  avgDailySavings: number,
): GoalProbabilityResult {
  const today        = new Date();
  const targetDate   = new Date(goal.deadline + 'T00:00:00Z');
  const daysRemaining = Math.max(0, Math.ceil((targetDate.getTime() - today.getTime()) / 86_400_000));
  const remaining    = goal.remainingPaise / 100;

  const requiredDailyAmount = daysRemaining > 0 ? remaining / daysRemaining : Infinity;

  const projectedExtra   = avgDailySavings * daysRemaining;
  const projectedAmount  = Math.min(
    goal.targetAmountPaise,
    goal.savedAmountPaise + projectedExtra,
  );
  
  const targetAmountPaise = goal.targetAmountPaise;
  const projectedAmountPaise = projectedAmount;
  
  const achievementPct   = goal.targetAmountPaise > 0
    ? Math.min(100, Goals.calculateGoalProgress(projectedAmountPaise, targetAmountPaise))
    : 100;

  const ratio       = requiredDailyAmount > 0 ? avgDailySavings / requiredDailyAmount : 2;
  const probability = daysRemaining === 0
    ? (goal.isCompleted ? 100 : 0)
    : logisticScore(Math.min(ratio, 3));

  let risk: GoalRisk;
  if (goal.isCompleted)                          risk = 'completed';
  else if (probability >= 70)                    risk = 'on_track';
  else if (probability >= 40)                    risk = 'at_risk';
  else                                           risk = 'behind';

  const weeksNeeded = avgDailySavings > 0
    ? Math.ceil(remaining / (avgDailySavings * 7))
    : Infinity;

  const recommendation = buildRecommendation(risk, goal.title, requiredDailyAmount, avgDailySavings, daysRemaining);
  const milestones = buildMilestones(goal, avgDailySavings, today);

  return {
    goalId:               goal.id,
    title:                goal.title,
    targetAmountPaise:    goal.targetAmountPaise,
    savedAmountPaise:     goal.savedAmountPaise,
    targetDate:           goal.deadline,
    daysRemaining,
    requiredDailyAmountPaise:  Math.round(requiredDailyAmount),
    actualDailyRatePaise:      Math.round(avgDailySavings),
    projectedAmountPaise:      Math.round(projectedAmount),
    achievementPct:       Math.round(achievementPct * 10) / 10,
    probability,
    risk,
    weeksNeeded:          isFinite(weeksNeeded) ? weeksNeeded : -1,
    recommendation,
    milestones,
  };
}

export function analyzeAllGoals(
  goals:           GoalDTO[],
  avgDailySavings: number,
): GoalProbabilityResult[] {
  return goals.map(g => analyzeGoal(g, avgDailySavings));
}

export function computeAvgDailySavings(
  months: { income: number; totalSpent: number; daysInMonth: number }[],
): number {
  if (months.length === 0) return 0;
  const totalSaved = months.reduce(
    (s, m) => s + Math.max(0, m.income - m.totalSpent), 0,
  );
  const totalDays = months.reduce((s, m) => s + m.daysInMonth, 0);
  return totalDays > 0 ? totalSaved / totalDays : 0;
}

function buildRecommendation(
  risk:         GoalRisk,
  title:        string,
  required:     number,
  actual:       number,
  daysLeft:     number,
): string {
  const $n = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const gap = required - actual;

  switch (risk) {
    case 'completed':
      return `"${title}" is complete! Consider setting a new, more ambitious goal.`;
    case 'on_track':
      return `You're on pace to hit "${title}" on time. Save at least ${$n(required)}/day to stay on track.`;
    case 'at_risk':
      return `"${title}" is at risk. You need ${$n(required)}/day but are saving ${$n(actual)}/day. Boost savings by ${$n(gap)}/day or extend your deadline.`;
    case 'behind':
      return `"${title}" is unlikely at the current pace. You need ${$n(required)}/day (${daysLeft} days left) but saving ${$n(actual)}/day. Consider a revised target or deadline.`;
  }
}

function buildMilestones(
  goal:            GoalDTO,
  avgDailySavings: number,
  today:           Date,
): GoalMilestone[] {
  return MILESTONE_PCTS.map(pct => {
    const targetForMilestone = goal.targetAmountPaise * (pct / 100);
    const alreadyReached     = goal.savedAmountPaise >= targetForMilestone;
    const amountStillNeeded  = Math.max(0, targetForMilestone - goal.savedAmountPaise);
    const daysToMilestone    = avgDailySavings > 0
      ? Math.ceil(amountStillNeeded / avgDailySavings)
      : Infinity;

    const estimatedDate = alreadyReached
      ? toDateStr(today)
      : isFinite(daysToMilestone)
        ? toDateStr(addDays(today, daysToMilestone))
        : '—';

    return {
      pct,
      label:         MILESTONE_LABELS[pct],
      estimatedDate,
      reached:       alreadyReached,
    };
  });
}


// ─── Pattern Detector ─────────────────────────────────────────────────────────

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function detectPatterns(
  expenses:    ExpenseDTO[],
  dailyBudget: number = 0,
): SpendingPattern {
  if (expenses.length === 0) {
    return {
      peakDayOfWeek:        '—',
      lowestDayOfWeek:      '—',
      peakWeekOfMonth:      0,
      avgTransactionSizePaise:   0,
      largestTransactionPaise:   0,
      mostFrequentCategory: '—',
      streakDaysUnderBudget: 0,
    };
  }

  const dowTotals = new Map<string, { total: number; count: number }>(
    DAY_ORDER.map(d => [d, { total: 0, count: 0 }]),
  );

  for (const e of expenses) {
    const d   = new Date(e.date + 'T00:00:00Z');
    const day = SHORT_DAY[d.getUTCDay()];
    const key = day === 'Sun' ? 'Sun' : day;
    const slot = dowTotals.get(key)!;
    slot.total += e.amountPaise;
    slot.count += 1;
  }

  const dowAvg = [...dowTotals.entries()].map(([day, s]) => ({
    day,
    avg: s.count > 0 ? s.total / s.count : 0,
  }));

  const peakDay   = dowAvg.reduce((a, b) => (b.avg > a.avg ? b : a));
  const lowestDay = dowAvg.filter(d => d.avg > 0).reduce(
    (a, b) => (b.avg < a.avg ? b : a),
    { day: '—', avg: Infinity },
  );

  const weekOfMonthTotals: number[] = [0, 0, 0, 0, 0];
  for (const e of expenses) {
    const day  = parseInt(e.date.split('-')[2], 10);
    const week = Math.min(4, Math.ceil(day / 7));
    weekOfMonthTotals[week] += e.amountPaise;
  }

  const peakWeekOfMonth = weekOfMonthTotals.indexOf(
    Math.max(...weekOfMonthTotals.slice(1)),
  );

  const amounts              = expenses.map(e => e.amountPaise);
  const avgTransactionSize   = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const largestTransaction   = Math.max(...amounts);

  const catCounts = new Map<string, number>();
  for (const e of expenses) {
    catCounts.set(e.categoryName, (catCounts.get(e.categoryName) ?? 0) + 1);
  }
  const mostFrequentCategory = [...catCounts.entries()].reduce(
    (a, b) => (b[1] > a[1] ? b : a),
    ['—', 0],
  )[0];

  const streakDaysUnderBudget = dailyBudget > 0
    ? computeStreak(expenses, dailyBudget)
    : 0;

  return {
    peakDayOfWeek:        peakDay.day,
    lowestDayOfWeek:      lowestDay.day,
    peakWeekOfMonth,
    avgTransactionSizePaise:   Math.round(avgTransactionSize),
    largestTransactionPaise:   Math.round(largestTransaction),
    mostFrequentCategory,
    streakDaysUnderBudget,
  };
}

function computeStreak(expenses: ExpenseDTO[], dailyBudget: number): number {
  const byDate = new Map<string, number>();
  for (const e of expenses) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amountPaise);
  }

  const today = new Date();
  let streak  = 0;

  for (let i = 0; i < 90; i++) {
    const d    = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key  = d.toISOString().slice(0, 10);
    const spent = byDate.get(key) ?? 0;

    if (spent === 0) {
      streak++;
      continue;
    }
    if (spent <= dailyBudget) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

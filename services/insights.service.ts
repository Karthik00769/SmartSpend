import { listExpenses } from './expense.service';
import { listBudgets }  from './budget.service';
import { listGoals }    from './goal.service';
import { query }        from '@/lib/db';
import { buildMonthlySummary, buildCategorySummaries } from '@/lib/expense-engine/aggregator';
import { Insights, Math as FinanceMath, Reports } from '@/lib/finance';
import { getISOWeek, getWeekStart } from '@/lib/expense-engine/validator';

import type { InsightContextDTO, ExpenseDTO, Period, TopCategory, CategoryTrendSummary, SpendingAnomaly, SavingsAnalysis, MonthlyBreakdown, WeekPeriod } from '@/types/api';

function getPrevMonth(year: number, month: number): Period {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function prevPrevSummaryTotal(expenses: ExpenseDTO[]): number {
  return expenses.reduce((s, e) => s + e.amountPaise, 0);
}

export async function buildInsightContext(
  userId: string,
  year:   number,
  month:  number,
  trendMonthCount: number = 3,
): Promise<InsightContextDTO> {
  const prevMonth        = getPrevMonth(year, month);
  const prevPrevMonth    = getPrevMonth(prevMonth.year, prevMonth.month);

  const [
    currentExpenses,
    prevExpenses,
    prevPrevExpenses,
    budgetSummary,
    goals,
    userRows,
  ] = await Promise.all([
    listExpenses({ userId, year, month, limit: 500 }),
    listExpenses({ userId, year: prevMonth.year, month: prevMonth.month, limit: 500 }),
    listExpenses({ userId, year: prevPrevMonth.year, month: prevPrevMonth.month, limit: 500 }),
    listBudgets({ userId, year, month }),
    listGoals({ userId, status: 'active' }),
    query<{ monthly_income_paise: string }[]>(`SELECT monthly_income_paise FROM users WHERE id = ? LIMIT 1`, [userId]),
  ]);

  const monthlyIncomePaise = parseInt(userRows[0]?.monthly_income_paise ?? '0', 10);
  const monthlyIncome      = FinanceMath.paiseToInr(monthlyIncomePaise);
  const dailyBudget        = monthlyIncomePaise > 0 ? FinanceMath.paiseToInr(monthlyIncomePaise) / 30 : 0;

  const budgetMap = new Map<number, number>(
    budgetSummary.categories.map(c => [c.categoryId, c.allocatedPaise]),
  );

  const [currentSummary, prevSummary] = [
    buildMonthlySummary(currentExpenses, year, month, monthlyIncome),
    buildMonthlySummary(prevExpenses, prevMonth.year, prevMonth.month, monthlyIncome),
  ];

  const [currentCats, prevCats] = [
    buildCategorySummaries(currentExpenses, budgetMap),
    buildCategorySummaries(prevExpenses, new Map()),
  ];

  // Week-over-week
  const today     = new Date();
  const thisWeek  = getISOWeek(today);
  const weekStart = getWeekStart(today);
  const weekEnd   = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
  const prevWeekEnd = new Date(prevWeekStart);
  prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() + 6);

  const currWeekExpenses = [...currentExpenses, ...prevExpenses].filter(e => {
    return e.date >= weekStart.toISOString().slice(0, 10) &&
           e.date <= weekEnd.toISOString().slice(0, 10);
  });

  const prevWeekExpenses = [...currentExpenses, ...prevExpenses].filter(e => {
    return e.date >= prevWeekStart.toISOString().slice(0, 10) &&
           e.date <= prevWeekEnd.toISOString().slice(0, 10);
  });

  let wowResult = null;
  if (currWeekExpenses.length > 0 || prevWeekExpenses.length > 0) {
    const currentWeekPeriod: WeekPeriod = {
      year, weekNumber: thisWeek,
      startDate: weekStart.toISOString().slice(0, 10),
      endDate:   weekEnd.toISOString().slice(0, 10),
    };
    const prevWeekPeriod: WeekPeriod = {
      year: prevWeekStart.getUTCFullYear(),
      weekNumber: thisWeek - 1 > 0 ? thisWeek - 1 : 52,
      startDate: prevWeekStart.toISOString().slice(0, 10),
      endDate:   prevWeekEnd.toISOString().slice(0, 10),
    };
    wowResult = Insights.buildWeekOverWeek(
      currWeekExpenses, prevWeekExpenses,
      currentWeekPeriod, prevWeekPeriod,
      buildCategorySummaries(currWeekExpenses, budgetMap),
      buildCategorySummaries(prevWeekExpenses, new Map())
    );
  }

  // Month-over-month
  const currentPeriod:  Period = { year, month };
  const previousPeriod: Period = { year: prevMonth.year, month: prevMonth.month };
  const momResult = Insights.buildMonthOverMonth(
    currentSummary, prevSummary,
    currentCats,    prevCats,
    currentPeriod,  previousPeriod,
  );

  const allExpenses = [...currentExpenses, ...prevExpenses, ...prevPrevExpenses];
  const pattern     = Insights.detectPatterns(allExpenses, dailyBudget);

  const threeMonths = [
    { income: monthlyIncome, totalSpent: prevPrevSummaryTotal(prevPrevExpenses), daysInMonth: 30 },
    { income: monthlyIncome, totalSpent: prevSummary.totalSpent,   daysInMonth: 30 },
    { income: monthlyIncome, totalSpent: currentSummary.totalSpent, daysInMonth: 30 },
  ];
  const avgDailySavings  = Insights.computeAvgDailySavings(threeMonths);
  const goalProbabilities = Insights.analyzeAllGoals(goals, avgDailySavings);

  const score = Insights.computeHealthScore({
    summary:    currentSummary,
    categories: currentCats,
    goals:      goalProbabilities,
    mom:        momResult,
  });

  const allExpensesForTrend = trendMonthCount >= 3
    ? [...currentExpenses, ...prevExpenses, ...prevPrevExpenses]
    : currentExpenses;
  const allCatsForTrend = buildCategorySummaries(allExpensesForTrend, budgetMap);

  const totalCurrentSpend = allCatsForTrend.reduce((s, c) => s + c.totalSpent, 0);
  const topCategories: TopCategory[] = allCatsForTrend.slice(0, 3).map(c => ({
    categoryName:      c.name,
    icon:              c.icon,
    color:             c.color,
    totalPaise:        c.totalSpent,
    percentageOfTotal: Reports.calculateCategoryPercentage(c.totalSpent, totalCurrentSpend),
  }));

  const prevCatMap2 = new Map(prevCats.map(c => [c.categoryId, c.totalSpent]));
  const categoryTrends: CategoryTrendSummary[] = currentCats.map(c => {
    const prev = prevCatMap2.get(c.categoryId) ?? 0;
    const delta = Insights.calcDelta(c.totalSpent, prev);
    let trend: CategoryTrendSummary['trend'] = 'stable';
    if (delta.direction === 'new') trend = 'new';
    else if (delta.direction === 'up') trend = 'increasing';
    else if (delta.direction === 'down') trend = 'decreasing';
    return {
      categoryName: c.name,
      icon:         c.icon,
      trend,
      trendPct:     Reports.roundPct(Math.abs(delta.percentage)),
      currentSpendPaise: c.totalSpent,
      prevSpendPaise:    prev,
    };
  }).sort((a, b) => b.currentSpendPaise - a.currentSpendPaise);

  const prevPrevCats = buildCategorySummaries(prevPrevExpenses, new Map());
  const prevPrevCatMap = new Map(prevPrevCats.map(c => [c.categoryId, c.totalSpent]));
  const anomalies: SpendingAnomaly[] = [];
  for (const c of currentCats) {
    const p1 = prevCatMap2.get(c.categoryId) ?? 0;
    const p2 = prevPrevCatMap.get(c.categoryId) ?? 0;
    if (p1 === 0 && p2 === 0) continue;
    const divisor = (p1 > 0 ? 1 : 0) + (p2 > 0 ? 1 : 0);
    const avg = (p1 + p2) / divisor;
    const ratio = avg > 0 ? c.totalSpent / avg : 0;
    if (ratio > 1.5) {
      anomalies.push({
        categoryName: c.name,
        icon:         c.icon,
        currentSpendPaise: c.totalSpent,
        avgPrevSpendPaise: Reports.calculateTwoMonthAverage(p1, p2),
        spikeRatio:   Reports.calculateSpikeRatio(c.totalSpent, avg),
        message:      `${c.name} spending is ${Reports.calculateSpikeRatio(c.totalSpent, avg)}× your recent average — unusually high this month.`,
      });
    }
  }

  const savingsRate = currentSummary.savingsRate;
  const savingsAnalysis: SavingsAnalysis = {
    incomePaise:         monthlyIncomePaise,
    totalSpentPaise:     currentSummary.totalSpent,
    savingsPaise:        currentSummary.savings,
    savingsRate,
    classification: Reports.classifySavingsRate(savingsRate),
  };

  const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const prevPrevSummary = buildMonthlySummary(prevPrevExpenses, prevPrevMonth.year, prevPrevMonth.month, monthlyIncome);

  const monthlyBreakdown: MonthlyBreakdown[] = [
    {
      year:       prevPrevMonth.year,
      month:      prevPrevMonth.month,
      label:      `${MONTH_NAMES[prevPrevMonth.month]} ${prevPrevMonth.year}`,
      totalSpentPaise: prevPrevSummary.totalSpent,
      savingsPaise:    prevPrevSummary.savings,
      savingsRate: prevPrevSummary.savingsRate,
    },
    {
      year:       prevMonth.year,
      month:      prevMonth.month,
      label:      `${MONTH_NAMES[prevMonth.month]} ${prevMonth.year}`,
      totalSpentPaise: prevSummary.totalSpent,
      savingsPaise:    prevSummary.savings,
      savingsRate: prevSummary.savingsRate,
    },
    {
      year,
      month,
      label:      `${MONTH_NAMES[month]} ${year}`,
      totalSpentPaise: currentSummary.totalSpent,
      savingsPaise:    currentSummary.savings,
      savingsRate: currentSummary.savingsRate,
    },
  ];

  return {
    generatedAt:       new Date().toISOString(),
    period:            { year, month },
    weekOverWeek:      wowResult,
    monthOverMonth:    momResult,
    goalProbabilities,
    pattern,
    score,
    topCategories,
    categoryTrends,
    anomalies,
    savingsAnalysis,
    monthlyBreakdown,
  };
}

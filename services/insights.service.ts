import { listExpenses, monthlyExpenseSummary, categoryWiseTotals, periodExpenseSummary } from './expense.service';
import { listBudgets }  from './budget.service';
import { listGoals }    from './goal.service';
import { query }        from '@/lib/db';
import { Insights, Math as FinanceMath, Reports } from '@/lib/finance';
import { getISOWeek } from '@/lib/expense-engine/validator';
import { startOfWeekIST, endOfWeekIST, formatDateIST, nowIST } from '@/lib/time/time.service';

import type { InsightContextDTO, Period, TopCategory, CategoryTrendSummary, SpendingAnomaly, SavingsAnalysis, MonthlyBreakdown, WeekPeriod } from '@/types/api';
import type { MonthlySummary, CategorySummary } from '@/lib/expense-engine/types';

function getPrevMonth(year: number, month: number): Period {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
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
    currentSummaryRaw,
    prevSummaryRaw,
    prevPrevSummaryRaw,
    currentCatsRaw,
    prevCatsRaw,
    prevPrevCatsRaw,
    budgetSummary,
    goals,
    userRows,
  ] = await Promise.all([
    monthlyExpenseSummary(userId, year, month),
    monthlyExpenseSummary(userId, prevMonth.year, prevMonth.month),
    monthlyExpenseSummary(userId, prevPrevMonth.year, prevPrevMonth.month),
    categoryWiseTotals(userId, year, month),
    categoryWiseTotals(userId, prevMonth.year, prevMonth.month),
    categoryWiseTotals(userId, prevPrevMonth.year, prevPrevMonth.month),
    listBudgets({ userId, year, month }),
    listGoals({ userId, status: 'active' }),
    query<{ monthly_income_minor: string }[]>(`SELECT monthly_income_minor FROM users WHERE id = ? LIMIT 1`, [userId]),
  ]);

  const monthlyIncomeMinor = parseInt(userRows[0]?.monthly_income_minor ?? '0', 10);
  const dailyBudget        = monthlyIncomeMinor > 0 ? FinanceMath.minorToInr(monthlyIncomeMinor) / 30 : 0;

  const budgetMap = new Map<number, number>(
    budgetSummary.categories.map(c => [c.categoryId, c.allocatedMinor]),
  );

  const mapMonthlySummary = (raw: any, y: number, m: number): MonthlySummary => ({
    year: y, month: m,
    label: `${y}-${m}`,
    totalSpent: raw.totalSpentMinor,
    transactionCount: raw.transactionCount,
    dailyAvg: raw.dailyAvgMinor,
    income: raw.incomeMinor,
    savings: raw.savingsMinor,
    savingsRate: raw.savingsRate,
    topCategory: '',
    topCategorySpend: 0,
  });

  const currentSummary = mapMonthlySummary(currentSummaryRaw, year, month);
  const prevSummary = mapMonthlySummary(prevSummaryRaw, prevMonth.year, prevMonth.month);
  const prevPrevSummary = mapMonthlySummary(prevPrevSummaryRaw, prevPrevMonth.year, prevPrevMonth.month);

  const mapCats = (raws: any[], bMap: Map<number, number>, totalSpent: number): CategorySummary[] => raws.map(c => ({
    categoryId: c.categoryId,
    name: c.name,
    icon: c.icon,
    color: '#000',
    totalSpent: c.totalMinor,
    txCount: 0,
    avgAmount: 0,
    pctOfTotal: totalSpent > 0 ? (c.totalMinor / totalSpent) * 100 : 0,
    budgetLimit: bMap.get(c.categoryId) ?? 0,
    budgetUsed: 0,
    isOverBudget: false,
  }));

  const currentCats = mapCats(currentCatsRaw, budgetMap, currentSummaryRaw.totalSpentMinor);
  const prevCats = mapCats(prevCatsRaw, new Map(), prevSummaryRaw.totalSpentMinor);
  const prevPrevCats = mapCats(prevPrevCatsRaw, new Map(), prevPrevSummaryRaw.totalSpentMinor);

  // Week-over-week using IST
  const today = nowIST();
  const weekStartDate = startOfWeekIST(today);
  const weekEndDate = endOfWeekIST(today);
  
  const prevWeekStartDate = new Date(weekStartDate);
  prevWeekStartDate.setDate(prevWeekStartDate.getDate() - 7);
  const prevWeekEndDate = new Date(weekStartDate);
  prevWeekEndDate.setDate(prevWeekEndDate.getDate() - 1);

  const weekStart = formatDateIST(weekStartDate);
  const weekEnd = formatDateIST(weekEndDate);
  const prevWeekStart = formatDateIST(prevWeekStartDate);
  const prevWeekEnd = formatDateIST(prevWeekEndDate);

  const thisWeek = getISOWeek(today);
  const prevWeekYear = prevWeekStartDate.getMonth() === 11 && today.getMonth() === 0 ? year - 1 : year;
  
  // Use engine's periodExpenseSummary instead of manual aggregation
  const [currWeekSummary, prevWeekSummary] = await Promise.all([
    periodExpenseSummary(userId, weekStart, weekEnd),
    periodExpenseSummary(userId, prevWeekStart, prevWeekEnd)
  ]);

  let wowResult = null;
  if (currWeekSummary.transactionCount > 0 || prevWeekSummary.transactionCount > 0) {
    const currentWeekPeriod: WeekPeriod = {
      year, weekNumber: thisWeek,
      startDate: weekStart, endDate: weekEnd,
    };
    const prevWeekPeriod: WeekPeriod = {
      year: prevWeekYear, weekNumber: thisWeek - 1 > 0 ? thisWeek - 1 : 52,
      startDate: prevWeekStart, endDate: prevWeekEnd,
    };
    // Mock buildWeekOverWeek return structure since we can't manually aggregate expenses anymore
    const diff = currWeekSummary.totalSpentMinor - prevWeekSummary.totalSpentMinor;
    wowResult = {
      currentWeek: currentWeekPeriod,
      previousWeek: prevWeekPeriod,
      totalSpend: {
        current: currWeekSummary.totalSpentMinor,
        previous: prevWeekSummary.totalSpentMinor,
        absolute: Math.abs(diff),
        percentage: prevWeekSummary.totalSpentMinor > 0 ? Math.round((diff / prevWeekSummary.totalSpentMinor) * 100) : 0,
        direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable',
        isSignificant: Math.abs(diff) > (prevWeekSummary.totalSpentMinor * 0.1)
      },
      txCount: { current: currWeekSummary.transactionCount, previous: prevWeekSummary.transactionCount, absolute: 0, percentage: 0, direction: 'stable', isSignificant: false },
      dailyAvg: { current: 0, previous: 0, absolute: 0, percentage: 0, direction: 'stable', isSignificant: false },
      topCategories: []
    };
  }

  // Month-over-month
  const currentPeriod: Period = { year, month };
  const previousPeriod: Period = { year: prevMonth.year, month: prevMonth.month };
  const momResult = Insights.buildMonthOverMonth(
    currentSummary, prevSummary,
    currentCats,    prevCats,
    currentPeriod,  previousPeriod,
  );

  // We must still list all expenses for pattern detection
  const [currentExpenses, prevExpenses, prevPrevExpenses] = await Promise.all([
    listExpenses({ userId, year, month, limit: 500 }),
    listExpenses({ userId, year: prevMonth.year, month: prevMonth.month, limit: 500 }),
    listExpenses({ userId, year: prevPrevMonth.year, month: prevPrevMonth.month, limit: 500 })
  ]);
  const allExpenses = [...currentExpenses, ...prevExpenses, ...prevPrevExpenses];
  const pattern = Insights.detectPatterns(allExpenses, dailyBudget);

  const threeMonths = [
    { income: monthlyIncomeMinor, totalSpent: prevPrevSummaryRaw.totalSpentMinor, daysInMonth: 30 },
    { income: monthlyIncomeMinor, totalSpent: prevSummaryRaw.totalSpentMinor,   daysInMonth: 30 },
    { income: monthlyIncomeMinor, totalSpent: currentSummaryRaw.totalSpentMinor, daysInMonth: 30 },
  ];
  const avgDailySavings  = Insights.computeAvgDailySavings(threeMonths);
  const goalProbabilities = Insights.analyzeAllGoals(goals, avgDailySavings);

  const score = Insights.computeHealthScore({
    summary:    currentSummary,
    categories: currentCats,
    goals:      goalProbabilities,
    mom:        momResult,
  });

  const totalCurrentSpend = currentCats.reduce((s, c) => s + c.totalSpent, 0);
  const topCategories: TopCategory[] = currentCats.slice(0, 3).map(c => ({
    categoryName:      c.name,
    icon:              c.icon || '',
    color:             c.color || '',
    totalMinor:        c.totalSpent,
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
      icon:         c.icon || '',
      trend,
      trendPct:     Reports.roundPct(Math.abs(delta.percentage)),
      currentSpendMinor: c.totalSpent,
      prevSpendMinor:    prev,
    };
  }).sort((a, b) => b.currentSpendMinor - a.currentSpendMinor);

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
        icon:         c.icon || '',
        currentSpendMinor: c.totalSpent,
        avgPrevSpendMinor: Reports.calculateTwoMonthAverage(p1, p2),
        spikeRatio:   Reports.calculateSpikeRatio(c.totalSpent, avg),
        message:      `${c.name} spending is ${Reports.calculateSpikeRatio(c.totalSpent, avg)}× your recent average — unusually high this month.`,
      });
    }
  }

  const savingsRate = currentSummary.savingsRate;
  const savingsAnalysis: SavingsAnalysis = {
    incomeMinor:     monthlyIncomeMinor,
    totalSpentMinor: currentSummary.totalSpent,
    savingsMinor:    currentSummary.savings,
    savingsRate,
    classification: Reports.classifySavingsRate(savingsRate),
  };

  const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const monthlyBreakdown: MonthlyBreakdown[] = [
    {
      year:       prevPrevMonth.year,
      month:      prevPrevMonth.month,
      label:      `${MONTH_NAMES[prevPrevMonth.month]} ${prevPrevMonth.year}`,
      totalSpentMinor: prevPrevSummary.totalSpent,
      savingsMinor:    prevPrevSummary.savings,
      savingsRate: prevPrevSummary.savingsRate,
    },
    {
      year:       prevMonth.year,
      month:      prevMonth.month,
      label:      `${MONTH_NAMES[prevMonth.month]} ${prevMonth.year}`,
      totalSpentMinor: prevSummary.totalSpent,
      savingsMinor:    prevSummary.savings,
      savingsRate: prevSummary.savingsRate,
    },
    {
      year,
      month,
      label:      `${MONTH_NAMES[month]} ${year}`,
      totalSpentMinor: currentSummary.totalSpent,
      savingsMinor:    currentSummary.savings,
      savingsRate: currentSummary.savingsRate,
    },
  ];

  return {
    generatedAt:       new Date().toISOString(),
    period:            { year, month },
    weekOverWeek:      wowResult as any,
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

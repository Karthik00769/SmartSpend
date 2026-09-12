import { BudgetSummaryDTO, GoalDTO } from '@/types/api';
import { Core } from '../finance';

export interface HealthScoreInput {
  monthlyIncomeMinor: number;
  totalSpentMinor: number;
  budgets: BudgetSummaryDTO;
  goals: GoalDTO[];
}

export interface HealthScoreResult {
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  details: {
    savingsRateScore: number;
    budgetComplianceScore: number;
    spendingStabilityScore: number;
    goalProgressScore: number;
    savingsRateScorePct: number;
    budgetComplianceScorePct: number;
    spendingStabilityScorePct: number;
    goalProgressScorePct: number;
    savingsRatePct: number;
    budgetCompliancePct: number;
  };
  recommendations: string[];
}

export function calculateHealthScore(data: HealthScoreInput): HealthScoreResult {
  const { monthlyIncomeMinor, totalSpentMinor, budgets, goals } = data;
  const recommendations: string[] = [];

  if (totalSpentMinor === 0 && budgets.categories.length === 0 && goals.length === 0) {
    return {
      score: 0,
      status: 'warning',
      details: {
        savingsRateScore: 0,
        budgetComplianceScore: 0,
        spendingStabilityScore: 0,
        goalProgressScore: 0,
        savingsRateScorePct: 0,
        budgetComplianceScorePct: 0,
        spendingStabilityScorePct: 0,
        goalProgressScorePct: 0,
        savingsRatePct: 0,
        budgetCompliancePct: 0
      },
      recommendations: ["Add a budget or track your first expense to generate a health score."]
    };
  }

  // 1. Savings Rate (40 Points)
  const savingsRatePct = Core.calculateSavingsRate(monthlyIncomeMinor, totalSpentMinor);
  let savingsRateScore = 0;
  if (savingsRatePct >= 20) {
    savingsRateScore = 40;
  } else if (savingsRatePct > 0) {
    savingsRateScore = Math.round(Core.calculateCategoryPercentage(savingsRatePct, 20) * 0.4);
    recommendations.push(`Increase your savings rate from ${savingsRatePct}% to 20% to boost your score.`);
  } else {
    savingsRateScore = 0;
    recommendations.push("Your expenses currently exceed your income. Try to reduce spending to start saving.");
  }

  // 2. Budget Compliance (30 Points)
  let budgetCompliancePct = 0; 
  let budgetComplianceScore = 0;
  if (budgets.categories.length > 0) {
    const compliantCount = budgets.categories.filter((c) => !c.isOverBudget).length;
    budgetCompliancePct = Core.calculateCategoryPercentage(compliantCount, budgets.categories.length);
    budgetComplianceScore = Math.round(budgetCompliancePct * 0.3);
    
    if (compliantCount < budgets.categories.length) {
      recommendations.push(`You have exceeded limits in ${budgets.categories.length - compliantCount} category(s). Reign them in to improve your score.`);
    }
  } else {
    recommendations.push("Create category budgets to gain better control over your spending.");
  }

  // 3. Spending Stability (20 Points)
  let spendingStabilityScore = 0; 
  if (budgets.totalBudgetMinor > 0) {
    const spendRatio = Core.calculateBudgetUsage(totalSpentMinor, budgets.totalBudgetMinor) / 100;
    if (spendRatio > 1.2) {
      spendingStabilityScore = 0;
      recommendations.push("Your total spending is significantly higher than your total allocated budget.");
    } else if (spendRatio > 1) {
      spendingStabilityScore = 10;
    } else {
      spendingStabilityScore = 20;
    }
  } else if (monthlyIncomeMinor > 0 && totalSpentMinor > 0) {
    const incomeRatio = totalSpentMinor / monthlyIncomeMinor;
    if (incomeRatio <= 0.5) spendingStabilityScore = 20;
    else if (incomeRatio <= 0.8) spendingStabilityScore = 10;
    else {
      spendingStabilityScore = 0;
      recommendations.push("You are spending a large portion of your income. Consider reviewing recurring subscriptions.");
    }
  }

  // 4. Goal Progress (10 Points)
  let goalProgressScore = 0;
  const activeGoals = goals.filter((g) => g.lifecycleStatus === 'active');
  if (activeGoals.length > 0) {
    let totalProgress = 0;
    for (const g of activeGoals) {
      totalProgress += (g.progressPct || 0);
    }
    const avgProgress = Core.calculateAverageSpend(totalProgress, activeGoals.length);
    
    if (avgProgress >= 50) goalProgressScore = 10;
    else if (avgProgress >= 20) goalProgressScore = 7;
    else if (avgProgress > 0) {
      goalProgressScore = 3;
      recommendations.push("Accelerate contributions to your financial goals to improve your progress.");
    }
    else {
      goalProgressScore = 0;
    }
  } else {
    recommendations.push("Create a financial goal (e.g. Emergency Fund) to increase your score.");
  }

  const rawScore = savingsRateScore + budgetComplianceScore + spendingStabilityScore + goalProgressScore;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  let status: HealthScoreResult['status'] = 'critical';
  if (score >= 80) status = 'excellent';
  else if (score >= 60) status = 'good';
  else if (score >= 40) status = 'warning';

  return {
    score,
    status,
    details: {
      savingsRateScore,
      budgetComplianceScore,
      spendingStabilityScore,
      goalProgressScore,
      savingsRateScorePct:        Math.round(Core.calculateCategoryPercentage(savingsRateScore, 40)),
      budgetComplianceScorePct:   Math.round(Core.calculateCategoryPercentage(budgetComplianceScore, 30)),
      spendingStabilityScorePct:  Math.round(Core.calculateCategoryPercentage(spendingStabilityScore, 20)),
      goalProgressScorePct:       Math.round(Core.calculateCategoryPercentage(goalProgressScore, 10)),
      savingsRatePct,
      budgetCompliancePct
    },
    recommendations
  };
}

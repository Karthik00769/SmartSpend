import { BudgetSummaryDTO, GoalDTO } from '@/types/api';
import { Analytics, Budget, Reports } from '../finance';

export interface HealthScoreInput {
  monthlyIncomePaise: number;
  totalSpentPaise: number;
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
}

/**
 * calculateHealthScore
 * Evaluates the user's financial setup across four dimensions to produce a composite
 * Financial Health Score between 0 and 100.
 * 
 * Weights:
 * - Savings Rate (40%)
 * - Budget Compliance (30%)
 * - Spending Stability (20%)
 * - Goal Progress (10%)
 */
export function calculateHealthScore(data: HealthScoreInput): HealthScoreResult {
  const { monthlyIncomePaise, totalSpentPaise, budgets, goals } = data;

  // Zero-state fix: If no data exists, score is strictly 0.
  if (totalSpentPaise === 0 && budgets.categories.length === 0 && goals.length === 0) {
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
      }
    };
  }

  // 1. Savings Rate (40 Points)
  // Target: Saving at least 20% of income yields full points.
  const savingsRatePct = Analytics.calculateSavingsRate(monthlyIncomePaise, totalSpentPaise);
  
  let savingsRateScore = 0;
  if (savingsRatePct >= 20) {
    savingsRateScore = 40;
  } else if (savingsRatePct > 0) {
    savingsRateScore = Math.round(Analytics.calculateCategoryPct(savingsRatePct, 20) * 0.4);
  } else {
    savingsRateScore = 0; // Negative savings = 0
  }

  // 2. Budget Compliance (30 Points)
  // Target: % of customized budgets that are NOT over the limit.
  let budgetCompliancePct = 0; 
  let budgetComplianceScore = 0;
  if (budgets.categories.length > 0) {
    const compliantCount = budgets.categories.filter((c) => !c.isOverBudget).length;
    budgetCompliancePct = Analytics.calculateCategoryPct(compliantCount, budgets.categories.length);
    budgetComplianceScore = Reports.roundPaise(budgetCompliancePct * 0.3);
  }

  // 3. Spending Stability (20 Points)
  // Target: Ratio of overall spent to overall total budget cap across all categories.
  let spendingStabilityScore = 0; 
  if (budgets.totalBudgetPaise > 0) {
    const spendRatio = Budget.calculateBudgetProgress(totalSpentPaise, budgets.totalBudgetPaise) / 100;
    
    if (spendRatio > 1.2) {
      spendingStabilityScore = 0; // highly unstable/overboard
    } else if (spendRatio > 1) {
      spendingStabilityScore = 10; // slightly over total budget buffer
    } else {
      spendingStabilityScore = 20; // well within total defined boundaries
    }
  } else if (monthlyIncomePaise > 0 && totalSpentPaise > 0) {
    // If no budgets but spending exists, evaluate based on income
    const incomeRatio = totalSpentPaise / monthlyIncomePaise;
    if (incomeRatio <= 0.5) spendingStabilityScore = 20;
    else if (incomeRatio <= 0.8) spendingStabilityScore = 10;
    else spendingStabilityScore = 0;
  }

  // 4. Goal Progress (10 Points)
  // Target: Demonstrating continuous measurable deposits against active targets.
  let goalProgressScore = 0;
  const activeGoals = goals.filter((g) => g.lifecycleStatus === 'active');
  if (activeGoals.length > 0) {
    let totalProgress = 0;
    for (const g of activeGoals) {
      totalProgress += (g.progressPct || 0);
    }
    const avgProgress = Analytics.calculateAverageSpend(totalProgress, activeGoals.length);
    
    if (avgProgress >= 50) goalProgressScore = 10;
    else if (avgProgress >= 20) goalProgressScore = 7;
    else if (avgProgress > 0) goalProgressScore = 3;
    else goalProgressScore = 0;
  }

  // Generate Composite Score
  const rawScore = savingsRateScore + budgetComplianceScore + spendingStabilityScore + goalProgressScore;
  const score = Reports.finalizeHealthScore(rawScore);

  // Determine Status Banding
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
      savingsRateScorePct:        Reports.roundPaise(Analytics.calculateCategoryPct(savingsRateScore, 40)),
      budgetComplianceScorePct:   Reports.roundPaise(Analytics.calculateCategoryPct(budgetComplianceScore, 30)),
      spendingStabilityScorePct:  Reports.roundPaise(Analytics.calculateCategoryPct(spendingStabilityScore, 20)),
      goalProgressScorePct:       Reports.roundPaise(Analytics.calculateCategoryPct(goalProgressScore, 10)),
      savingsRatePct,
      budgetCompliancePct
    }
  };
}

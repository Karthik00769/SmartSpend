import { BudgetSummaryDTO, GoalDTO } from '@/types/api';

export interface HealthScoreInput {
  monthlyIncome: number;
  totalSpent: number;
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
  const { monthlyIncome, totalSpent, budgets, goals } = data;

  // Zero-state fix: If no data exists, score is strictly 0.
  if (totalSpent === 0 && budgets.categories.length === 0 && goals.length === 0) {
    return {
      score: 0,
      status: 'warning',
      details: {
        savingsRateScore: 0,
        budgetComplianceScore: 0,
        spendingStabilityScore: 0,
        goalProgressScore: 0,
        savingsRatePct: 0,
        budgetCompliancePct: 0
      }
    };
  }

  // 1. Savings Rate (40 Points)
  // Target: Saving at least 20% of income yields full points.
  let savingsRatePct = 0;
  if (monthlyIncome > 0) {
    savingsRatePct = ((monthlyIncome - totalSpent) / monthlyIncome) * 100;
  }
  
  let savingsRateScore = 0;
  if (savingsRatePct >= 20) {
    savingsRateScore = 40;
  } else if (savingsRatePct > 0) {
    savingsRateScore = Math.round((savingsRatePct / 20) * 40);
  } else {
    savingsRateScore = 0; // Negative savings = 0
  }

  // 2. Budget Compliance (30 Points)
  // Target: % of customized budgets that are NOT over the limit.
  let budgetCompliancePct = 0; 
  let budgetComplianceScore = 0;
  if (budgets.categories.length > 0) {
    const compliantCount = budgets.categories.filter((c) => !c.isOverBudget).length;
    budgetCompliancePct = (compliantCount / budgets.categories.length) * 100;
    budgetComplianceScore = Math.round((budgetCompliancePct / 100) * 30);
  }

  // 3. Spending Stability (20 Points)
  // Target: Ratio of overall spent to overall total budget cap across all categories.
  let spendingStabilityScore = 0; 
  if (budgets.totalBudget > 0) {
    const spendRatio = totalSpent / budgets.totalBudget;
    if (spendRatio > 1.2) {
      spendingStabilityScore = 0; // highly unstable/overboard
    } else if (spendRatio > 1) {
      spendingStabilityScore = 10; // slightly over total budget buffer
    } else {
      spendingStabilityScore = 20; // well within total defined boundaries
    }
  } else if (monthlyIncome > 0 && totalSpent > 0) {
    // If no budgets but spending exists, evaluate based on income
    const incomeRatio = totalSpent / monthlyIncome;
    if (incomeRatio <= 0.5) spendingStabilityScore = 20;
    else if (incomeRatio <= 0.8) spendingStabilityScore = 10;
    else spendingStabilityScore = 0;
  }

  // 4. Goal Progress (10 Points)
  // Target: Demonstrating continuous measurable deposits against active targets.
  let goalProgressScore = 0;
  const activeGoals = goals.filter((g) => g.status === 'active');
  if (activeGoals.length > 0) {
    // Calculate average completion rate of active goals, mapping to points
    const totalProgress = activeGoals.reduce((acc, g) => acc + (g.completionPct || 0), 0);
    const avgProgress = totalProgress / activeGoals.length;
    
    if (avgProgress >= 50) goalProgressScore = 10;
    else if (avgProgress >= 20) goalProgressScore = 7;
    else if (avgProgress > 0) goalProgressScore = 3;
    else goalProgressScore = 0;
  }

  // Generate Composite Score
  const rawScore = savingsRateScore + budgetComplianceScore + spendingStabilityScore + goalProgressScore;
  const score = Math.max(0, Math.min(100, Math.round(rawScore))); // Clamp and round

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
      savingsRatePct,
      budgetCompliancePct
    }
  };
}

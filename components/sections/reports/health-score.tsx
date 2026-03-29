import { Card } from '@/components/ui/card';

interface HealthScoreProps {
  score: number;
  details?: {
    savingsRateScore: number;
    budgetComplianceScore: number;
    spendingStabilityScore: number;
    goalProgressScore: number;
  };
}

export function HealthScore({ score, details }: HealthScoreProps) {
  const metrics = [
    { label: 'Budget Compliance', value: details ? Math.round((details.budgetComplianceScore / 30) * 100) : 0 },
    { label: 'Savings Rate', value: details ? Math.round((details.savingsRateScore / 40) * 100) : 0 },
    { label: 'Spending Stability', value: details ? Math.round((details.spendingStabilityScore / 20) * 100) : 0 },
    { label: 'Goal Progress', value: details ? Math.round((details.goalProgressScore / 10) * 100) : 0 },
  ];

  const getScoreColor = (value: number) => {
    if (value >= 80) return 'text-green-600 dark:text-green-400';
    if (value >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBackground = (value: number) => {
    if (value >= 80) return 'bg-green-100 dark:bg-green-950/30';
    if (value >= 60) return 'bg-yellow-100 dark:bg-yellow-950/30';
    return 'bg-red-100 dark:bg-red-950/30';
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-foreground mb-6">Financial Health Score</h2>

      <div className={`${getScoreBackground(score)} rounded-lg p-8 mb-8 text-center`}>
        <div className="text-6xl font-bold mb-2">
          <span className={getScoreColor(score)}>{score}</span>
          <span className="text-2xl text-muted-foreground ml-2">/100</span>
        </div>
        <p className="text-lg text-foreground">
          {score >= 80 && 'Excellent Financial Health'}
          {score >= 60 && score < 80 && 'Good Financial Health'}
          {score < 60 && 'Needs Improvement'}
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-foreground mb-4">Score Breakdown</h3>
        {metrics.map((metric, idx) => (
          <div key={idx}>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{metric.label}</span>
              <span className={`text-sm font-bold ${getScoreColor(metric.value)}`}>
                {metric.value}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className={`h-full ${
                  metric.value >= 80
                    ? 'bg-green-500'
                    : metric.value >= 60
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                } transition-all`}
                style={{ width: `${metric.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="font-semibold text-foreground mb-3">Recommendations</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• Increase your savings rate by reducing discretionary spending</li>
          <li>• Focus on high-priority financial goals</li>
          <li>• Keep your budget compliance above 90%</li>
          <li>• Build your emergency fund to 6 months of expenses</li>
        </ul>
      </div>
    </Card>
  );
}

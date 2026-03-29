import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Goal } from '@/types';

interface GoalProgressProps {
  goals: Goal[];
}

export function GoalProgress({ goals }: GoalProgressProps) {
  const getGoalPercentage = (goal: Goal) => {
    return (goal.currentAmount / goal.targetAmount) * 100;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 dark:text-red-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-foreground mb-6">Active Goals</h3>
      <div className="space-y-6">
        {goals.map((goal) => {
          const percentage = getGoalPercentage(goal);
          const remaining = goal.targetAmount - goal.currentAmount;
          const daysRemaining = Math.ceil(
            (new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );

          return (
            <div key={goal.id}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-foreground">{goal.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPriorityColor(goal.priority)} bg-current/10`}>
                      {goal.priority}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{goal.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-muted-foreground">
                  ${goal.currentAmount.toFixed(2)} / ${goal.targetAmount.toFixed(2)}
                </span>
                <span className="font-medium text-foreground">
                  {percentage.toFixed(0)}%
                </span>
              </div>
              <Progress value={percentage} className="h-2 mb-2" />
              <p className="text-xs text-muted-foreground">
                {daysRemaining > 0 
                  ? `${daysRemaining} days remaining` 
                  : 'Deadline passed'}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

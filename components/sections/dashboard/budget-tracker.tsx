import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Budget } from '@/types';
import { EXPENSE_CATEGORIES } from '@/lib/constants';

interface BudgetTrackerProps {
  budget: Budget;
}

export function BudgetTracker({ budget }: BudgetTrackerProps) {
  const getCategoryLabel = (id: string) => {
    return EXPENSE_CATEGORIES.find(c => c.id === id)?.label || id;
  };

  return (
    <Card className="p-6 mb-8">
      <h3 className="text-lg font-semibold text-foreground mb-6">Budget Overview</h3>
      <div className="space-y-4">
        {budget.categories.map((category) => {
          const percentage = (category.spent / category.allocated) * 100;
          const isOverBudget = percentage > 100;

          return (
            <div key={category.category}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  {getCategoryLabel(category.category)}
                </span>
                <span className="text-sm text-muted-foreground">
                  ${category.spent.toFixed(2)} / ${category.allocated.toFixed(2)}
                </span>
              </div>
              <Progress
                value={Math.min(percentage, 100)}
                className="h-2"
              />
              {isOverBudget && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Over budget by ${(category.spent - category.allocated).toFixed(2)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

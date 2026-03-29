'use client';

/**
 * app/(app)/budget/page.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Reads budget data from SmartSpend context (no direct fetch).
 * Shows a skeleton while loading and a BudgetTracker with real data.
 */

import { useSmartSpend } from '@/context/smartspend-context';
import { BudgetForm }    from '@/components/sections/budget/budget-form';
import { BudgetTracker } from '@/components/sections/dashboard/budget-tracker';
import { Card }          from '@/components/ui/card';
import type { Budget }   from '@/types';

function BudgetSkeleton() {
  return (
    <div className="animate-pulse grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="h-80 bg-muted rounded-xl" />
      <div className="lg:col-span-2 h-80 bg-muted rounded-xl" />
    </div>
  );
}

export default function BudgetPage() {
  const { budget, budgetLoading, budgetError, period } = useSmartSpend();

  // Adapt API budget data to BudgetTracker prop shape
  const budgetForTracker: Budget | null = budget
    ? {
        id:          '1',
        userId:      '1',
        month:       `${period.year}-${String(period.month).padStart(2, '0')}`,
        totalAmount: budget.categories.reduce((s, c) => s + c.allocated, 0),
        categories:  budget.categories.map(c => ({
          category:  c.category,
          allocated: c.allocated,
          spent:     c.spent,
        })),
        createdAt: new Date(),
      }
    : null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Budget Management</h1>
        <p className="text-muted-foreground">
          Set your monthly budget limits and track spending by category
        </p>
      </div>

      {budgetLoading ? (
        <BudgetSkeleton />
      ) : budgetError ? (
        <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-red-700 dark:text-red-400">⚠️ {budgetError}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            {/* Form uses context.upsertBudget() internally */}
            <BudgetForm />
          </div>
          <div className="lg:col-span-2">
            {budgetForTracker ? (
              <BudgetTracker budget={budgetForTracker} />
            ) : (
              <Card className="p-12 text-center">
                <p className="text-4xl mb-3">💡</p>
                <p className="text-muted-foreground">
                  No budgets set yet. Use the form to set your first category limit.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

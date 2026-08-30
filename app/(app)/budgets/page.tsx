'use client';

import { useState } from 'react';
import { useSmartSpend } from '@/context/smartspend-context';
import { BudgetForm }    from '@/components/sections/budget/budget-form';
import { BudgetTracker } from '@/components/sections/dashboard/budget-tracker';
import { Card }          from '@/components/ui/card';
import * as FinanceCore from '@/lib/finance';
import { Button }        from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function BudgetSkeleton() {
  return (
    <div className="animate-pulse grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="h-80 bg-muted rounded-xl" />
      <div className="lg:col-span-2 h-80 bg-muted rounded-xl" />
    </div>
  );
}

export default function BudgetPage() {
  const {
    budget, budgetLoading, budgetError,
    period, setPeriod,
    refreshAll,
    fmt,
  } = useSmartSpend();

  const now = new Date();
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  // Past months are read-only — only current month is editable
  const isCurrentPeriod =
    period.year === now.getFullYear() && period.month === now.getMonth() + 1;
  const isPastPeriod = !isCurrentPeriod &&
    (period.year < now.getFullYear() ||
     (period.year === now.getFullYear() && period.month < now.getMonth() + 1));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Budget Management</h1>
          <p className="text-muted-foreground text-sm">
            Set monthly limits per category and track spending in real time.
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <Select
            value={String(period.month)}
            onValueChange={v => setPeriod(period.year, Number(v))}
          >
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(period.year)}
            onValueChange={v => setPeriod(Number(v), period.month)}
          >
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary KPI strip */}
      {budget && !budgetLoading && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            {
              label: 'Total Budget',
              value: `${fmt(FinanceCore.Math.paiseToInr(budget.totalBudgetPaise))}`,
              icon: '📋',
              cls: 'text-foreground',
            },
            {
              label: 'Total Spent',
              value: `${fmt(FinanceCore.Math.paiseToInr(budget.totalSpentPaise))}`,
              icon: '💸',
              cls: budget.totalSpentPaise > budget.totalBudgetPaise
                ? 'text-red-600 dark:text-red-400'
                : 'text-foreground',
            },
            {
              label: 'Remaining',
              value: `${fmt(FinanceCore.Math.paiseToInr(FinanceCore.Math.subtract(budget.totalBudgetPaise, budget.totalSpentPaise)))}`,
              icon: '💰',
              cls: FinanceCore.Budget.isBudgetExceeded(budget.totalSpentPaise, budget.totalBudgetPaise)
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400',
            },
          ].map(c => (
            <Card key={c.label} className="p-4 flex items-center gap-3">
              <span className="text-2xl">{c.icon}</span>
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-xl font-bold ${c.cls}`}>{c.value}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Main content */}
      {budgetLoading ? (
        <BudgetSkeleton />
      ) : budgetError ? (
        <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-red-700 dark:text-red-400">⚠️ {budgetError}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            {isPastPeriod ? (
              <Card className="p-5 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">📅 Past period — read only</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Historical budgets cannot be edited to preserve analytics accuracy.
                  Switch to the current month to make changes.
                </p>
              </Card>
            ) : (
              <BudgetForm />
            )}
          </div>
          <div className="lg:col-span-2">
            {budget ? (
              <BudgetTracker
                budget={budget}
                onDeleted={refreshAll}
                fmt={fmt}
              />
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

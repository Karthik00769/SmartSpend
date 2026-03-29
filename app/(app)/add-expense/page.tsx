'use client';

/**
 * app/(app)/add-expense/page.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Add Expense page — reads expense list from SmartSpend context.
 * ManualEntryForm already uses context.addExpense() internally.
 */

import { useSmartSpend } from '@/context/smartspend-context';
import { ManualEntryForm } from '@/components/sections/expense/manual-entry-form';
import { UploadArea }      from '@/components/sections/expense/upload-area';
import { ScanReceiptArea } from '@/components/sections/expense/scan-receipt';
import { Card }            from '@/components/ui/card';

import { useState } from 'react';

export default function AddExpensePage() {
  const { expenses, expensesLoading } = useSmartSpend();
  const [prefill, setPrefill] = useState<any>(null);

  // Show the 10 most recent entries
  const recent = expenses.slice(0, 10);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Add Expense</h1>
        <p className="text-muted-foreground">
          Record spending manually or upload an image — expenses are auto-categorized by the engine
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form — uses context.addExpense() */}
        <div className="lg:col-span-2">
          <ManualEntryForm initialData={prefill} />
        </div>

        {/* Right column: upload area + recent list */}
        <div className="space-y-6">
          <ScanReceiptArea onDataExtracted={(data) => setPrefill(data)} />
          <UploadArea />

          {/* Recent expenses */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Recent Expenses</h3>

            {expensesLoading ? (
              <div className="space-y-3 animate-pulse">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded-lg" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No expenses yet. Add your first one! 👆
              </p>
            ) : (
              <div className="space-y-1">
                {recent.map(e => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">{e.categoryIcon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground leading-tight truncate">
                            {e.description || e.categoryName}
                          </p>
                          {e.categorySource === 'auto' && (
                            <span className="text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              🤖 Auto
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{e.date}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400 shrink-0 ml-3">
                      −${e.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

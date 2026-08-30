'use client';

import { useState } from 'react';
import { Card }     from '@/components/ui/card';
import { apiDelete, ApiRequestError } from '@/lib/api-client';
import { Analytics } from '@/lib/finance';
import * as FinanceCore from '@/lib/finance';
import type { BudgetSummaryDTO, BudgetCategoryDTO } from '@/types/api';

interface BudgetTrackerProps {
  budget:    BudgetSummaryDTO;
  onDeleted?: () => void;
  fmt?:      (amount: number) => string;
}

// ─── Color logic ──────────────────────────────────────────────────────────────

function getBarColor(pct: number | null): string {
  if (pct === null) return 'bg-muted';
  if (pct >= 100)   return 'bg-red-500';
  if (pct >= 80)    return 'bg-yellow-500';
  return 'bg-green-500';
}

function getTextColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 100)   return 'text-red-600 dark:text-red-400';
  if (pct >= 80)    return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

function AlertBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct < 80) return null;
  if (pct >= 100) {
    return (
      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
        Exceeded
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
      Warning
    </span>
  );
}

// ─── Single budget row ────────────────────────────────────────────────────────

function BudgetRow({ cat, onDeleted, fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }: { cat: BudgetCategoryDTO; onDeleted?: () => void; fmt?: (n: number) => string }) {
  const [deleting, setDeleting] = useState(false);
  const pct = cat.usedPct;
  const barPct = Math.min(pct ?? 0, 100);

  const handleDelete = async () => {
    if (!confirm(`Remove budget for "${cat.category}"?`)) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/budgets/${cat.id}`);
      onDeleted?.();
    } catch (err) {
      alert(err instanceof ApiRequestError ? err.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group py-3 border-b border-border/50 last:border-0">
      {/* Row header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{cat.icon}</span>
          <span className="text-sm font-medium text-foreground truncate">{cat.category}</span>
          <AlertBadge pct={pct} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-semibold tabular-nums ${getTextColor(pct)}`}>
            {fmt(FinanceCore.Math.paiseToInr(cat.spentPaise))}
            <span className="text-muted-foreground font-normal"> / {fmt(FinanceCore.Math.paiseToInr(cat.allocatedPaise))}</span>
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
            title="Remove budget"
          >
            {deleting ? '…' : '✕'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getBarColor(pct)}`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      {/* Sub-line */}
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-muted-foreground">
          {pct !== null ? `${pct.toFixed(0)}% used` : 'No spend yet'}
        </span>
        <span className={`text-[11px] font-medium ${cat.remainingPaise < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
          {cat.remainingPaise >= 0
            ? `${fmt(FinanceCore.Math.paiseToInr(cat.remainingPaise))} left`
            : `${fmt(FinanceCore.Math.paiseToInr(Math.abs(cat.remainingPaise)))} over`}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BudgetTracker({ budget, onDeleted, fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }: BudgetTrackerProps) {
  const overallPct = Math.round(Analytics.calculateBudgetUsedPct(budget.totalSpentPaise, budget.totalBudgetPaise));

  if (budget.categories.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-4xl mb-3">💡</p>
        <p className="text-muted-foreground">No budgets set yet. Use the form to add your first limit.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {/* Summary header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Budget Overview</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {fmt(FinanceCore.Math.paiseToInr(budget.totalSpentPaise))} spent of {fmt(FinanceCore.Math.paiseToInr(budget.totalBudgetPaise))} total
          </p>
        </div>
        <div className="text-right">
          <span className={`text-2xl font-bold ${getTextColor(overallPct)}`}>
            {overallPct}%
          </span>
          <p className="text-[11px] text-muted-foreground">overall</p>
        </div>
      </div>

      {/* Overall bar */}
      <div className="h-3 rounded-full bg-muted overflow-hidden mb-6">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getBarColor(overallPct)}`}
          style={{ width: `${Math.min(overallPct, 100)}%` }}
        />
      </div>

      {/* Per-category rows */}
      <div>
        {budget.categories.map(cat => (
          <BudgetRow key={cat.id} cat={cat} onDeleted={onDeleted} fmt={fmt} />
        ))}
      </div>

      {/* Alert summary */}
      {budget.categories.some(c => (c.usedPct ?? 0) >= 80) && (
        <div className="mt-5 pt-4 border-t border-border space-y-1.5">
          {budget.categories
            .filter(c => (c.usedPct ?? 0) >= 100)
            .map(c => (
              <p key={c.id} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                🚨 <strong>{c.category}</strong> exceeded by {fmt(FinanceCore.Math.paiseToInr(Math.abs(c.remainingPaise)))}
              </p>
            ))}
          {budget.categories
            .filter(c => (c.usedPct ?? 0) >= 80 && (c.usedPct ?? 0) < 100)
            .map(c => (
              <p key={c.id} className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">
                ⚠️ <strong>{c.category}</strong> at {c.usedPct?.toFixed(0)}% — {fmt(FinanceCore.Math.paiseToInr(c.remainingPaise))} remaining
              </p>
            ))}
        </div>
      )}
    </Card>
  );
}

'use client';

import Link              from 'next/link';
import { useMemo, useState } from 'react';
import { useSmartSpend } from '@/context/smartspend-context';
import { Card }          from '@/components/ui/card';
import { Skeleton }      from '@/components/ui/skeleton';
import { Progress }      from '@/components/ui/progress';
import { SpendingChart } from '@/components/sections/dashboard/spending-chart';
import type { BudgetCategoryDTO, GoalDTO, ExpenseDTO } from '@/types/api';

// ─── Alert types ──────────────────────────────────────────────────────────────

type AlertLevel = 'critical' | 'warning' | 'info' | 'success';

interface SmartAlert {
  id:         string;
  level:      AlertLevel;
  emoji:      string;
  title:      string;
  detail:     string;
  href?:      string;
  hrefLabel?: string;
}

const LEVEL_STYLE: Record<AlertLevel, { card: string; badge: string }> = {
  critical: {
    card:  'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  },
  warning: {
    card:  'border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30',
    badge: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  },
  info: {
    card:  'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30',
    badge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
  },
  success: {
    card:  'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30',
    badge: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
  },
};

// ─── Alert computation — pure, uses only context data already fetched ─────────

function computeAlerts(
  budgetCategories: BudgetCategoryDTO[],
  goals:            GoalDTO[],
  expenses:         ExpenseDTO[],
  fmt:              (n: number) => string,
): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  // 1. Budget exceeded
  for (const b of budgetCategories) {
    if (b.isOverBudget) {
      alerts.push({
        id:        `budget-exceeded-${b.categoryId}`,
        level:     'critical',
        emoji:     '🚨',
        title:     `${b.icon} ${b.category} budget exceeded`,
        detail:    `${fmt(Math.abs(b.remaining))} over your ${fmt(b.allocated)} limit.`,
        href:      '/budgets',
        hrefLabel: 'Review budget',
      });
    }
  }

  // 2. Budget nearing limit (80–99%)
  for (const b of budgetCategories) {
    if (!b.isOverBudget && b.usedPct !== null && b.usedPct >= 80) {
      alerts.push({
        id:        `budget-warning-${b.categoryId}`,
        level:     'warning',
        emoji:     '⚠️',
        title:     `${b.icon} ${b.category} at ${b.usedPct.toFixed(0)}%`,
        detail:    `${fmt(b.remaining)} remaining of your ${fmt(b.allocated)} limit.`,
        href:      '/budgets',
        hrefLabel: 'View budget',
      });
    }
  }

  // 3. Unusual spending spike — this week vs last week (from context expenses)
  if (expenses.length > 0) {
    const now        = new Date();
    const todayStr   = now.toISOString().slice(0, 10);
    const dayOfWeek  = (now.getDay() + 6) % 7; // 0=Mon
    const thisMonStart = new Date(now);
    thisMonStart.setDate(now.getDate() - dayOfWeek);
    const thisWeekStart  = thisMonStart.toISOString().slice(0, 10);
    const lastMonStart   = new Date(thisMonStart);
    lastMonStart.setDate(thisMonStart.getDate() - 7);
    const lastWeekStart  = lastMonStart.toISOString().slice(0, 10);
    const lastWeekEnd    = new Date(thisMonStart);
    lastWeekEnd.setDate(thisMonStart.getDate() - 1);
    const lastWeekEndStr = lastWeekEnd.toISOString().slice(0, 10);

    const thisWeekTotal = expenses
      .filter(e => e.date >= thisWeekStart && e.date <= todayStr)
      .reduce((s, e) => s + e.amount, 0);
    const lastWeekTotal = expenses
      .filter(e => e.date >= lastWeekStart && e.date <= lastWeekEndStr)
      .reduce((s, e) => s + e.amount, 0);

    if (lastWeekTotal > 10 && thisWeekTotal > lastWeekTotal * 1.5) {
      const spikePct = Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100);
      alerts.push({
        id:        'spending-spike',
        level:     'warning',
        emoji:     '📈',
        title:     `Spending spike this week (+${spikePct}%)`,
        detail:    `${fmt(thisWeekTotal)} this week vs ${fmt(lastWeekTotal)} last week.`,
        href:      '/expenses-history',
        hrefLabel: 'Review transactions',
      });
    }
  }

  // 4. Goal milestones — show highest reached milestone per active goal
  const MILESTONES = [100, 75, 50, 25];
  for (const g of goals.filter(g => g.status === 'active')) {
    const pct = g.targetAmount > 0
      ? Math.round((g.savedAmount / g.targetAmount) * 100)
      : 0;
    for (const milestone of MILESTONES) {
      if (pct >= milestone) {
        alerts.push({
          id:        `goal-milestone-${g.id}-${milestone}`,
          level:     milestone === 100 ? 'success' : 'info',
          emoji:     milestone === 100 ? '🏆' : milestone >= 75 ? '🎯' : milestone >= 50 ? '💪' : '🌱',
          title:     milestone === 100
            ? `Goal "${g.title}" completed!`
            : `${milestone}% milestone — "${g.title}"`,
          detail:    `${fmt(g.savedAmount)} of ${fmt(g.targetAmount)} saved.`,
          href:      '/goals',
          hrefLabel: 'View goals',
        });
        break;
      }
    }
  }

  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

// ─── Alert banner ─────────────────────────────────────────────────────────────

function AlertBanner({ alerts }: { alerts: SmartAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map(alert => {
        const s = LEVEL_STYLE[alert.level];
        return (
          <div key={alert.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${s.card} animate-in slide-in-from-top-2 duration-300`}>
            <span className="text-xl shrink-0 mt-0.5">{alert.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${s.badge}`}>
                  {alert.level}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {alert.href && (
                <Link href={alert.href} className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                  {alert.hrefLabel ?? 'View'} →
                </Link>
              )}
              <button
                onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
                className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                aria-label="Dismiss"
              >✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Budget bar color ─────────────────────────────────────────────────────────

function budgetBarCls(pct: number | null): string {
  if (!pct) return '';
  if (pct >= 100) return '[&>div]:bg-red-500';
  if (pct >= 80)  return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-green-500';
}

// ─── Goal bar color ───────────────────────────────────────────────────────────

function goalBarCls(pct: number): string {
  if (pct >= 100) return '[&>div]:bg-green-500';
  if (pct >= 50)  return '[&>div]:bg-blue-500';
  return '[&>div]:bg-indigo-400';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    dashboardSummary:        data,
    dashboardSummaryLoading: loading,
    dashboardSummaryError:   error,
    refreshDashboardSummary: refresh,
    expenses,
    goals,
    budget,
    fmt,
  } = useSmartSpend();

  const alerts = useMemo(
    () => computeAlerts(budget?.categories ?? [], goals, expenses, fmt),
    [budget, goals, expenses, fmt],
  );

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-red-700 dark:text-red-400 font-medium">⚠️ {error || 'Failed to load'}</p>
          <button onClick={refresh} className="mt-3 text-sm text-red-600 hover:underline">
            Try again
          </button>
        </Card>
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  // Top category — from budget data (sorted by spent desc) or expenses
  const topCategory = budget?.categories.length
    ? budget.categories.slice().sort((a, b) => b.spent - a.spent)[0]
    : null;

  // Recent 5 transactions from context (already fetched, no extra call)
  const recentTx = expenses.slice(0, 5);

  // Active goals only
  const activeGoals = goals.filter(g => g.status === 'active').slice(0, 4);

  const healthColors: Record<string, string> = {
    excellent: 'text-green-500',
    good:      'text-green-400',
    warning:   'text-yellow-500',
    critical:  'text-red-500',
  };
  const statusColor = healthColors[data.financialHealthScore.status] ?? 'text-muted-foreground';

  const isEmpty = data.totalSpending === 0 && data.budgetProgress.length === 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your financial overview at a glance.</p>
        </div>
        <Link href="/add-expense"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors w-fit">
          + Add Expense
        </Link>
      </div>

      {/* ── Smart Alerts ── */}
      <AlertBanner alerts={alerts} />

      {/* Empty state */}
      {isEmpty && (
        <Card className="p-12 text-center border-dashed">
          <p className="text-4xl mb-3">🌱</p>
          <h2 className="text-lg font-bold text-foreground mb-2">No data yet</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Add your first expense to start seeing insights.
          </p>
          <Link href="/add-expense"
            className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors">
            Add First Expense
          </Link>
        </Card>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Total spent */}
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Total Spent</p>
          <p className="text-xl font-semibold text-foreground tabular-nums">{fmt(data.totalSpending)}</p>
          <p className="text-xs text-muted-foreground mt-1">This month</p>
        </Card>

        {/* Savings rate */}
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Savings Rate</p>
          <p className={`text-xl font-semibold tabular-nums ${data.savingsRate >= 20 ? 'text-green-600 dark:text-green-400' : data.savingsRate > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
            {data.savingsRate}%
          </p>
          <Progress value={data.savingsRate} className="h-1 mt-2" />
        </Card>

        {/* Top category */}
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Top Category</p>
          {topCategory ? (
            <>
              <div className="flex items-center gap-1.5">
                <span>{topCategory.icon}</span>
                <p className="text-sm font-semibold text-foreground truncate">{topCategory.category}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                {fmt(topCategory.spent)} spent
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </Card>

        {/* Health score */}
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Health Score</p>
          <p className={`text-xl font-semibold tabular-nums ${statusColor}`}>
            {data.financialHealthScore.score}
            <span className="text-xs font-normal text-muted-foreground ml-1">/ 100</span>
          </p>
          <p className={`text-xs font-medium mt-1 capitalize ${statusColor}`}>
            {data.financialHealthScore.status}
          </p>
        </Card>
      </div>

      {/* ── Trend chart + Budget summary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Spending trend */}
        {data.monthlyTrend && data.monthlyTrend.length > 0 && (
          <div className="lg:col-span-2">
            <SpendingChart data={data.monthlyTrend} title="Monthly Spending Trend" variant="bar" fmt={fmt} />
          </div>
        )}

        {/* Budget usage summary */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Budget Usage</h3>
            <Link href="/budgets" className="text-xs text-primary hover:underline">Manage →</Link>
          </div>
          {data.budgetProgress.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-1.5">No budgets set.</p>
              <Link href="/budgets" className="text-xs text-primary hover:underline">Set one up →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {data.budgetProgress.slice(0, 5).map((b, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-foreground truncate max-w-[120px]">{b.category}</span>
                    <span className={b.isOverBudget ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                      {b.usedPct != null ? `${b.usedPct.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                  <Progress value={Math.min(b.usedPct ?? 0, 100)} className={`h-1 ${budgetBarCls(b.usedPct)}`} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Recent Transactions + Active Goals ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Recent transactions */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Transactions</h3>
            <Link href="/expenses-history" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {recentTx.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">No transactions yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {recentTx.map(tx => (
                <div key={tx.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">{tx.categoryIcon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate leading-tight">
                        {tx.categoryName}{tx.description ? ` (${tx.description})` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tx.date}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                    {fmt(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Active goals */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Active Goals</h3>
            <Link href="/goals" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {activeGoals.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-1.5">No active goals.</p>
              <Link href="/goals" className="text-xs text-primary hover:underline">Create one →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeGoals.map(g => {
                const pct = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
                const remaining = Math.max(0, g.targetAmount - g.savedAmount);
                return (
                  <div key={g.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-foreground truncate max-w-[160px]">{g.title}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {pct}% · {fmt(remaining)} left
                      </span>
                    </div>
                    <Progress value={pct} className={`h-1 ${goalBarCls(pct)}`} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Recent Insights ── */}
      {data.recentInsights.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Insights</h3>
            <Link href="/insights" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.recentInsights.slice(0, 3).map(insight => (
              <div key={insight.id} className="p-3 rounded-lg bg-muted/40 border border-border/50">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-1">
                  {insight.type.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-foreground leading-relaxed line-clamp-3">{insight.content}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

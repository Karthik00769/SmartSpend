'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSmartSpend } from '@/context/smartspend-context';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRouter } from 'next/navigation';
import { SpendingChart } from '@/components/sections/dashboard/spending-chart';
import * as FinanceCore from '@/lib/finance';
import type { BudgetCategoryDTO, GoalDTO, ExpenseDTO, SmartAlert, AlertLevel } from '@/types/api';

const LEVEL_STYLE: Record<AlertLevel, { card: string; badge: string }> = {
  critical: {
    card: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  },
  warning: {
    card: 'border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30',
    badge: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  },
  info: {
    card: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30',
    badge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
  },
  success: {
    card: 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30',
    badge: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
  },
};

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

function budgetBarCls(status?: 'safe' | 'warning' | 'exceeded'): string {
  if (status === 'exceeded') return '[&>div]:bg-red-500';
  if (status === 'warning') return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-green-500';
}

// ─── Goal bar color ───────────────────────────────────────────────────────────

function goalBarCls(pct: number): string {
  if (pct >= 100) return '[&>div]:bg-green-500';
  if (pct >= 50) return '[&>div]:bg-blue-500';
  return '[&>div]:bg-indigo-400';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const {
    dashboardSummary: data,
    dashboardSummaryLoading: loading,
    dashboardSummaryError: error,
    refreshDashboardSummary: refresh,
    expenses,
    goals,
    budget,
    fmt,
  } = useSmartSpend();

  const alerts = data?.alerts ?? [];

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

  const topCategory = data.topCategories?.[0] ?? null;
  const recentTx = data.recentExpenses ?? [];
  const activeGoals = data.goals.slice(0, 4);

  const healthColors: Record<string, string> = {
    excellent: 'text-green-500 bg-green-500/10 border-green-500/20',
    good: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    warning: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    critical: 'text-red-500 bg-red-500/10 border-red-500/20',
  };
  const statusClasses = healthColors[data.healthStatus] ?? 'text-muted-foreground bg-muted border-border';

  const isEmpty = data.totalSpentMinor === 0 && (!data.topCategories || data.topCategories.length === 0);

  return (
    <div className="space-y-6 pb-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your financial pulse at a glance.</p>
        </div>
        <Link href="/add-expense"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl shadow-sm hover:shadow-md hover:bg-primary/90 transition-all w-fit">
          <span className="text-lg leading-none">+</span> Add Expense
        </Link>
      </div>

      {/* ── Smart Alerts ── */}
      <AlertBanner alerts={alerts} />

      {/* Empty state */}
      {isEmpty && (
        <EmptyState
          title="No data yet"
          description="Start tracking your expenses to unlock powerful insights and take control of your finances."
          icon="🌱"
          action={{
            label: "Add First Expense",
            onClick: () => router.push('/add-expense') // Note: route doesn't exist yet but matching previous state
          }}
          className="border-dashed border-2 border-border/50 bg-muted/20"
        />
      )}

      {/* ── Bento Grid ── */}
      {!isEmpty && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 auto-rows-min gap-4 lg:gap-5">

          {/* Total Spent KPI */}
          <Card className="p-5 flex flex-col justify-between overflow-hidden relative group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <svg className="w-12 h-12 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
            </div>
            <p className="text-sm text-muted-foreground font-medium mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary/50"></span>
              Total Spent
            </p>
            <div>
              <p className="text-2xl lg:text-3xl font-bold text-foreground tabular-nums tracking-tight">
                {fmt(data.totalSpentMinor)}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium">This month</p>
            </div>
          </Card>

          {/* Savings Rate KPI */}
          <Card className="p-5 flex flex-col justify-between overflow-hidden relative group hover:shadow-md transition-shadow">
            <p className="text-sm text-muted-foreground font-medium mb-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${data.savingsRate >= 20 ? 'bg-green-500' : data.savingsRate > 0 ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
              Savings Rate
            </p>
            <div>
              <p className={`text-2xl lg:text-3xl font-bold tabular-nums tracking-tight ${data.savingsRate >= 20 ? 'text-green-600 dark:text-green-400' : data.savingsRate > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {data.savingsRate}%
              </p>
              <Progress value={Math.max(0, data.savingsRate)} className="h-1.5 mt-3 opacity-80" />
            </div>
          </Card>

          {/* Top Category KPI */}
          <Card className="p-5 flex flex-col justify-between overflow-hidden group hover:shadow-md transition-shadow">
            <p className="text-sm text-muted-foreground font-medium mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent/50"></span>
              Top Category
            </p>
            {topCategory ? (
              <div className="flex items-center gap-3 mt-1">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-xl shrink-0">
                  {topCategory.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-foreground truncate">{topCategory.category}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {fmt(topCategory.spentMinor)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-auto">No data yet</p>
            )}
          </Card>

          {/* Health Score KPI */}
          <Card className={`p-5 flex flex-col justify-between border-2 ${statusClasses} group hover:shadow-md transition-shadow`}>
            <p className="text-sm font-medium mb-2 flex items-center gap-2 opacity-80">
              <span className="w-2 h-2 rounded-full bg-current"></span>
              Financial Health
            </p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl lg:text-3xl font-bold tabular-nums tracking-tight">
                  {data.healthScore}
                </p>
                <p className="text-sm font-semibold mt-1 capitalize opacity-90">
                  {data.healthStatus}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full border-4 border-current opacity-20 flex items-center justify-center">
                <span className="text-xs font-bold">100</span>
              </div>
            </div>
          </Card>

          {/* Spending Trend Chart */}
          {data.monthlyTrend && data.monthlyTrend.length > 0 && (
            <Card className="md:col-span-2 lg:col-span-2 lg:row-span-2 p-1 border-border/50 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 pt-5 pb-2">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>
                  Spending Trend
                </h3>
              </div>
              <div className="flex-1 min-h-[250px]">
                <SpendingChart data={data.monthlyTrend.map(t => ({ label: t.label, spent: t.spentMinor }))} title="" variant="bar" fmt={fmt} />
              </div>
            </Card>
          )}

          {/* Budget Usage */}
          <Card className="md:col-span-2 lg:col-span-2 p-5 flex flex-col border-border/50 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                Budget Monitor
              </h3>
              <Link href="/budgets" className="text-xs font-medium text-primary hover:underline px-2 py-1 bg-primary/10 rounded-md">Manage</Link>
            </div>
            {data.topCategories.length === 0 ? (
              <div className="text-center py-6 mt-auto mb-auto bg-muted/30 rounded-xl border border-dashed">
                <p className="text-sm text-muted-foreground mb-2">No budgets set up yet.</p>
                <Link href="/budgets" className="text-sm font-semibold text-primary hover:underline">Create a Budget</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {data.topCategories.slice(0, 4).map((b, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium text-foreground truncate max-w-[150px] flex items-center gap-2">
                        {b.icon} {b.category}
                      </span>
                      <span className={b.isOverBudget ? 'text-red-500 font-bold tabular-nums' : 'text-muted-foreground font-medium tabular-nums'}>
                        {b.usedPct != null ? `${b.usedPct.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                    <Progress value={Math.min(b.usedPct ?? 0, 100)} className={`h-1.5 ${budgetBarCls(b.status as any)} group-hover:h-2 transition-all`} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent Transactions */}
          <Card className="md:col-span-1 lg:col-span-2 p-5 border-border/50 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Recent Activity
              </h3>
              <Link href="/expenses-history" className="text-xs font-medium text-primary hover:underline px-2 py-1 bg-primary/10 rounded-md">View All</Link>
            </div>
            {recentTx.length === 0 ? (
              <div className="text-center py-6 mt-auto mb-auto bg-muted/30 rounded-xl border border-dashed">
                <p className="text-sm text-muted-foreground">No recent transactions.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {recentTx.slice(0, 4).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-lg shrink-0">
                        {tx.categoryIcon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate leading-tight">
                          {tx.categoryName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {tx.description || tx.date}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground tabular-nums shrink-0">
                      {fmt(tx.amountMinor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Active Goals */}
          <Card className="md:col-span-1 lg:col-span-2 p-5 border-border/50 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Active Goals
              </h3>
              <Link href="/goals" className="text-xs font-medium text-primary hover:underline px-2 py-1 bg-primary/10 rounded-md">View All</Link>
            </div>
            {activeGoals.length === 0 ? (
              <div className="text-center py-6 mt-auto mb-auto bg-muted/30 rounded-xl border border-dashed">
                <p className="text-sm text-muted-foreground mb-2">No active goals.</p>
                <Link href="/goals" className="text-sm font-semibold text-primary hover:underline">Set a Goal</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {activeGoals.map(g => {
                  const pct = g.progressPct;
                  const remaining = g.remainingMinor;
                  return (
                    <div key={g.id} className="group">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-foreground truncate max-w-[160px]">{g.title}</span>
                        <span className="text-muted-foreground font-medium tabular-nums shrink-0">
                          <span className="text-foreground">{pct}%</span> · {fmt(remaining)} left
                        </span>
                      </div>
                      <Progress value={pct} className={`h-1.5 ${goalBarCls(pct)} group-hover:h-2 transition-all`} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>
      )}

      {/* ── Recent Insights ── */}
      {data.recentInsights.length > 0 && !isEmpty && (
        <Card className="p-5 border-border/50 shadow-sm bg-gradient-to-br from-background to-muted/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="text-xl">💡</span>
              AI Insights
            </h3>
            <Link href="/insights" className="text-xs font-medium text-primary hover:underline px-2 py-1 bg-primary/10 rounded-md">View All</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.recentInsights.slice(0, 3).map(insight => (
              <div key={insight.id} className="p-4 rounded-xl bg-background border border-border/40 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 group-hover:bg-primary transition-colors"></div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">
                  {insight.type.replace(/_/g, ' ')}
                </p>
                <p className="text-sm text-foreground leading-relaxed line-clamp-3">{insight.content}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

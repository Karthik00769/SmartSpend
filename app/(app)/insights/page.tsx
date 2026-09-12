'use client';

import { useState } from 'react';
import Link          from 'next/link';
import { useSmartSpend } from '@/context/smartspend-context';
import { useInsights }   from '@/hooks/use-insights';
import { useRouter }     from 'next/navigation';
import { Card }          from '@/components/ui/card';
import { EmptyState }    from '@/components/ui/EmptyState';
import { Button }        from '@/components/ui/button';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { TextAdvice, GoalProbabilityResult } from '@/types/api';
import * as FinanceCore from '@/lib/finance';
import { currentMonthIST, currentYearIST } from '@/lib/time/time.service';

type PeriodKey = 'this' | 'last' | '3m';

function getPeriod(key: PeriodKey): { year: number; month: number; label: string; months?: number } {
  const currentYear = currentYearIST();
  const currentMonth = currentMonthIST();

  if (key === 'this') return { year: currentYear, month: currentMonth, label: 'This Month' };
  if (key === 'last') {
    const d = new Date(currentYear, currentMonth - 1 - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: 'Last Month' };
  }
  return { year: currentYear, month: currentMonth, label: 'Last 3 Months', months: 3 };
}

const SECTIONS = [
  {
    key: 'critical' as const, label: '🔴 Alerts', sublabel: 'Needs immediate attention',
    bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  },
  {
    key: 'warning' as const, label: '🟡 Warnings', sublabel: 'Worth keeping an eye on',
    bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
    badge: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  },
  {
    key: 'positive' as const, label: '🟢 Good Habits', sublabel: 'Keep it up',
    bg: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
    badge: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
  },
  {
    key: 'info' as const, label: '📊 Summary', sublabel: 'Observations about your spending',
    bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
  },
];

function InsightCard({ card, badge, bg }: { card: TextAdvice; badge: string; bg: string }) {
  return (
    <div className={`p-4 rounded-xl border ${bg}`}>
      <div className="flex gap-3">
        <span className="text-xl shrink-0 mt-0.5">{card.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug mb-1">{card.headline}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">{card.detail}</p>
          {card.actionLabel && card.actionHref && (
            <Link href={card.actionHref}
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md ${badge} hover:opacity-80 transition-opacity`}>
              {card.actionLabel} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryPie({ data, fmt }: { data: { name: string; value: number; fill: string; pct?: number }[]; fmt: (n: number) => string }) {
  if (!data?.length) return null;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Category Breakdown</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
              {data.map((e, i) => <Cell key={i} fill={e.fill} />)}
            </Pie>
            <Tooltip
              formatter={(v: number, name: string, props: any) => {
                const pct = props?.payload?.pct;
                return [
                  `${fmt(v)}${pct != null ? ` (${pct}%)` : ''}`,
                  name,
                ];
              }}
              contentStyle={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
            <Legend iconType="circle" iconSize={7}
              formatter={(v) => <span style={{ fontSize: 10, color: '#9ca3af' }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function GoalCard({ goal, fmt }: { goal: GoalProbabilityResult & { savedAmountMinor?: number; targetAmountMinor?: number }; fmt: (n: number) => string }) {
  const riskCls: Record<string, string> = {
    completed: 'text-green-600 dark:text-green-400',
    on_track:  'text-blue-600 dark:text-blue-400',
    at_risk:   'text-yellow-600 dark:text-yellow-400',
    behind:    'text-red-600 dark:text-red-400',
  };
  
  const saved = goal.savedAmountMinor;
  const target = goal.targetAmountMinor;
  const progressPct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const remaining = Math.max(0, target - saved);
  
  return (
    <div className="p-4 rounded-xl border border-border bg-muted/20">
      <div className="flex justify-between items-start mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{goal.title}</p>
          <p className="text-xs text-muted-foreground">{fmt(saved)} / {fmt(target)}</p>
        </div>
        <span className={`text-base font-bold shrink-0 ml-2 ${riskCls[goal.risk]}`}>{progressPct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all duration-500 ${
          progressPct >= 70 ? 'bg-blue-500' : progressPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
        }`} style={{ width: `${progressPct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mb-2">
        <span>Amount Remaining: {fmt(remaining)}</span>
        <span>Req. Daily: {fmt(goal.requiredDailyAmountMinor || 0)}</span>
      </div>
      <p className="text-xs font-medium text-foreground mt-1.5 border-t border-border/50 pt-2">{goal.recommendation}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-20 bg-muted rounded-xl" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="h-24 bg-muted rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export default function InsightsPage() {
  const router = useRouter();
  const { fmt, expenses } = useSmartSpend();
  const [periodKey, setPeriodKey] = useState<PeriodKey>('this');
  const period = getPeriod(periodKey);

  const { data, loading, error, refresh } = useInsights({ year: period.year, month: period.month, months: period.months ?? 3 });

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
        </div>
        <Skeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
        <Card className="p-5 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-400 mb-3">⚠️ {error ?? 'Failed to load insights.'}</p>
          <Button size="sm" variant="outline" onClick={refresh}>Try again</Button>
        </Card>
      </div>
    );
  }

  const { advice, goalProbabilities, topCategories, categoryTrends, anomalies, savingsAnalysis, aiSuggestions, monthlyBreakdown } = data;

  // ── Build category→description map from raw expenses ─────────────────────
  const catDescMap = new Map<string, string[]>();
  let biggestTx = expenses[0];
  for (const e of expenses) {
    if (!catDescMap.has(e.categoryName)) catDescMap.set(e.categoryName, []);
    const descs = catDescMap.get(e.categoryName)!;
    const d = e.description?.trim();
    if (d && !descs.includes(d)) descs.push(d);
    
    if (!biggestTx || e.amountMinor > biggestTx.amountMinor) {
      biggestTx = e;
    }
  }

  const catLabel = (categoryName: string, description?: string | null): string => {
    const descs = catDescMap.get(categoryName) ?? [];
    if (descs.length <= 1 && !description) return categoryName;
    const d = description?.trim();
    return d ? `${categoryName} (${d})` : categoryName;
  };

  const COLORS = ['#6366f1','#f97316','#22c55e','#ef4444','#a855f7','#ec4899','#eab308','#0891b2','#6b7280','#14b8a6'];
  const txPieMap = new Map<string, { name: string; value: number; fill: string; icon: string }>();
  expenses.forEach((e) => {
    const key = catLabel(e.categoryName, e.description);
    if (txPieMap.has(key)) {
      txPieMap.get(key)!.value += e.amountMinor;
    } else {
      txPieMap.set(key, {
        name:  key,
        value: e.amountMinor,
        fill:  COLORS[txPieMap.size % COLORS.length],
        icon:  e.categoryIcon,
      });
    }
  });
  const txPieData = [...txPieMap.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const hasAnyData = expenses.length > 0 || advice.length > 0;

  if (!hasAnyData) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
        <EmptyState
          title="No insights yet"
          description="Add expenses to start seeing personalised financial insights."
          icon="🔍"
          action={{
            label: "Add your first expense",
            onClick: () => router.push('/dashboard')
          }}
          className="border-dashed"
        />
      </div>
    );
  }

  const bySection = {
    critical: advice.filter(a => a.severity === 'critical'),
    warning:  advice.filter(a => a.severity === 'warning'),
    positive: advice.filter(a => a.severity === 'positive'),
    info:     advice.filter(a => a.severity === 'info'),
  };
  const totalAlerts = bySection.critical.length + bySection.warning.length;

  const trendIcon = (t: string) => t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : t === 'new' ? '✦' : '→';
  const trendCls  = (t: string) =>
    t === 'increasing' ? 'text-red-600 dark:text-red-400' :
    t === 'decreasing' ? 'text-green-600 dark:text-green-400' :
    t === 'new'        ? 'text-blue-600 dark:text-blue-400' :
    'text-muted-foreground';

  const savingsCls =
    savingsAnalysis.classification === 'good'     ? 'text-green-600 dark:text-green-400' :
    savingsAnalysis.classification === 'moderate' ? 'text-yellow-600 dark:text-yellow-400' :
    'text-red-600 dark:text-red-400';

  const largestCat = topCategories[0]?.categoryName || 'None';
  const closestGoal = goalProbabilities && goalProbabilities.length > 0 
    ? [...goalProbabilities].sort((a, b) => {
        const aTarget = a.targetAmountMinor;
        const aSaved = a.savedAmountMinor;
        const bTarget = b.targetAmountMinor;
        const bSaved = b.savedAmountMinor;
        const aRem = Math.max(0, aTarget - aSaved);
        const bRem = Math.max(0, bTarget - bSaved);
        return aRem - bRem;
      })[0] 
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalAlerts > 0
              ? `${totalAlerts} item${totalAlerts > 1 ? 's' : ''} need${totalAlerts === 1 ? 's' : ''} your attention`
              : 'Your finances look healthy this period'}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg">
          {(['this', 'last', '3m'] as PeriodKey[]).map(k => (
            <button key={k} onClick={() => setPeriodKey(k)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                periodKey === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {getPeriod(k).label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Executive Summary */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">1. Executive Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1 truncate">Total Spent</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{fmt(savingsAnalysis.totalSpentMinor)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1 truncate">Savings Rate</p>
            <p className={`text-lg font-bold tabular-nums ${savingsCls}`}>
              {FinanceCore.Math.abs(savingsAnalysis.savingsRate)}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1 truncate">Largest Category</p>
            <p className="text-sm font-bold text-foreground truncate mt-1">{largestCat}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1 truncate">Biggest Transaction</p>
            <p className="text-sm font-bold text-foreground truncate mt-1">{biggestTx ? biggestTx.categoryName : 'None'}</p>
            {biggestTx && <p className="text-xs text-muted-foreground">{fmt(biggestTx.amountMinor)}</p>}
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1 truncate">Closest Goal</p>
            <p className="text-sm font-bold text-foreground truncate mt-1">{closestGoal ? closestGoal.title : 'None'}</p>
          </Card>
        </div>
      </section>

      {/* 2. Spending Analysis */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">2. Spending Analysis</h2>
        
        {monthlyBreakdown && monthlyBreakdown.some(m => m.totalSpentMinor > 0) && (() => {
          const mappedBreakdown = monthlyBreakdown.map(m => ({
            ...m,
            totalSpent: m.totalSpentMinor,
            savings: m.savingsMinor
          }));
          return (
            <div className="mb-5">
              <Card className="p-4">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mappedBreakdown} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} vertical={false} />
                      <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} width={60}
                        tickFormatter={(v) => fmt(v)} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                        formatter={(v: number, name: string) => [fmt(v), name]}
                      />
                      <Bar dataKey="totalSpent" name="Spent" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="savings" name="Saved" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border/40">
                  {mappedBreakdown.map((m, i) => (
                    <div key={i} className="text-center">
                      <p className="text-xs font-medium text-foreground">{m.label}</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{fmt(m.totalSpent)}</p>
                      <p className="text-[10px] text-muted-foreground">{m.savingsRate}% saved</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          );
        })()}

        {txPieData.length > 0 && <CategoryPie data={txPieData} fmt={fmt} />}
      </section>

      {/* 3. Goal Analysis */}
      {goalProbabilities && goalProbabilities.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">3. Goal Analysis</h2>
          <Card className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goalProbabilities.map(g => <GoalCard key={g.goalId} goal={g} fmt={fmt} />)}
            </div>
          </Card>
        </section>
      )}

      {/* 4. AI Recommendations */}
      {aiSuggestions && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">4. AI Recommendations</h2>
          <Card className="p-6 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20">
            <div className="flex gap-4">
              <span className="text-3xl shrink-0 mt-1">✨</span>
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-line space-y-2">
                {aiSuggestions}
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* 5. Trends */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">5. Trends</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {categoryTrends.length > 0 && (
            <Card className="p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase">Category Trends</h3>
              <div className="space-y-2">
                {categoryTrends.slice(0, 6).map((t, i) => {
                  const topTx = expenses.find(e => e.categoryName === t.categoryName && e.description);
                  const label = topTx?.description ? `${t.categoryName} (${topTx.description})` : t.categoryName;
                  return (
                    <div key={`trend-${i}`} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{t.icon}</span>
                        <span className="text-sm text-foreground truncate">{label}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">{fmt(t.currentSpendMinor)}</span>
                        <span className={`text-sm font-bold ${trendCls(t.trend)}`}>
                          {trendIcon(t.trend)} {t.trend !== 'stable' && t.trend !== 'new' ? `${t.trendPct}%` : t.trend}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {anomalies.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground mb-1 uppercase pl-1">Unusual Spending</h3>
              {anomalies.map((a, i) => {
                const topDesc = expenses
                  .filter(e => e.categoryName === a.categoryName && e.description?.trim())
                  .sort((a2, b) => b.amountMinor - a2.amountMinor)[0]?.description;
                const label = catLabel(a.categoryName, topDesc);
                return (
                  <div key={`anomaly-${i}`} className="p-4 rounded-xl border bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800 flex gap-3">
                    <span className="text-xl shrink-0">{a.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{label} — {a.spikeRatio}× spike</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        This month: {fmt(a.currentSpendMinor)} · Recent avg: {fmt(a.avgPrevSpendMinor)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rule-based advice sections conditionally rendered under Trends */}
        <div className="mt-6 space-y-5">
          {SECTIONS.map(section => {
            const cards = bySection[section.key];
            if (cards.length === 0) return null; // Hide completely when empty
            return (
              <div key={section.key}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${section.badge}`}>{cards.length}</span>
                  <span className="text-xs text-muted-foreground">{section.sublabel}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {cards.map(card => <InsightCard key={card.id} card={card} badge={section.badge} bg={section.bg} />)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

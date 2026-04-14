'use client';

import { useState } from 'react';
import Link          from 'next/link';
import { useSmartSpend } from '@/context/smartspend-context';
import { useInsights }   from '@/hooks/use-insights';
import { Card }          from '@/components/ui/card';
import { Button }        from '@/components/ui/button';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { TextAdvice, GoalProbabilityResult } from '@/lib/insights-engine/types';

type PeriodKey = 'this' | 'last' | '3m';

function getPeriod(key: PeriodKey): { year: number; month: number; label: string; months?: number } {
  const now = new Date();
  if (key === 'this') return { year: now.getFullYear(), month: now.getMonth() + 1, label: 'This Month' };
  if (key === 'last') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: 'Last Month' };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1, label: 'Last 3 Months', months: 3 };
}

const SECTIONS = [
  {
    key: 'critical' as const, label: '🔴 Alerts', sublabel: 'Needs immediate attention',
    empty: "No critical alerts — you're in good shape.",
    bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  },
  {
    key: 'warning' as const, label: '🟡 Warnings', sublabel: 'Worth keeping an eye on',
    empty: 'No warnings this period.',
    bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
    badge: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
  },
  {
    key: 'positive' as const, label: '🟢 Good Habits', sublabel: 'Keep it up',
    empty: 'Add more expenses to track positive habits.',
    bg: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
    badge: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
  },
  {
    key: 'info' as const, label: '📊 Summary', sublabel: 'Observations about your spending',
    empty: 'No summary data yet.',
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

function SummaryCard({ data, fmt }: { data: any; fmt: (n: number) => string }) {
  const mom = data.monthOverMonth;
  const totalSpent = mom.totalSpend.current;
  const savings    = mom.savings.current;
  const topCat     = mom.categories[0]?.categoryName ?? '—';
  const trend      = mom.totalSpend.direction;
  const trendIcon  = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendCls   = trend === 'up' ? 'text-red-600 dark:text-red-400'
    : trend === 'down' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground';
  return (
    <Card className="p-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
          <p className="text-lg font-semibold text-foreground tabular-nums">{fmt(totalSpent)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Saved</p>
          <p className={`text-lg font-semibold tabular-nums ${savings >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {fmt(Math.abs(savings))}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Top Category</p>
          <p className="text-sm font-semibold text-foreground truncate">{topCat}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Spending Trend</p>
          <p className={`text-lg font-bold ${trendCls}`}>
            {trendIcon} {mom.totalSpend.isSignificant ? `${Math.abs(mom.totalSpend.percentage)}%` : 'Stable'}
          </p>
        </div>
      </div>
    </Card>
  );
}

function CategoryPie({ data }: { data: { name: string; value: number; fill: string; pct?: number }[] }) {
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
                  `${v.toFixed(2)}${pct != null ? ` (${pct}%)` : ''}`,
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

function GoalCard({ goal, fmt }: { goal: GoalProbabilityResult; fmt: (n: number) => string }) {
  const riskCls: Record<string, string> = {
    completed: 'text-green-600 dark:text-green-400',
    on_track:  'text-blue-600 dark:text-blue-400',
    at_risk:   'text-yellow-600 dark:text-yellow-400',
    behind:    'text-red-600 dark:text-red-400',
  };
  return (
    <div className="p-4 rounded-xl border border-border bg-muted/20">
      <div className="flex justify-between items-start mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{goal.title}</p>
          <p className="text-xs text-muted-foreground">{fmt(goal.savedAmount)} / {fmt(goal.targetAmount)}</p>
        </div>
        <span className={`text-base font-bold shrink-0 ml-2 ${riskCls[goal.risk]}`}>{goal.probability}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${
          goal.probability >= 70 ? 'bg-blue-500' : goal.probability >= 40 ? 'bg-yellow-500' : 'bg-red-500'
        }`} style={{ width: `${goal.probability}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">{goal.recommendation}</p>
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

  const { advice, goalProbabilities, monthOverMonth, topCategories, categoryTrends, anomalies, savingsAnalysis, aiSuggestions, monthlyBreakdown } = data;

  // ── Build category→description map from raw expenses ─────────────────────
  // Groups all descriptions per category so we can show "Food (Swiggy)", "Food (Zomato)" etc.
  const catDescMap = new Map<string, string[]>();
  for (const e of expenses) {
    if (!catDescMap.has(e.categoryName)) catDescMap.set(e.categoryName, []);
    const descs = catDescMap.get(e.categoryName)!;
    const d = e.description?.trim();
    if (d && !descs.includes(d)) descs.push(d);
  }

  // Helper: label for a category — appends "(desc)" only when category repeats with different descriptions
  const catLabel = (categoryName: string, description?: string | null): string => {
    const descs = catDescMap.get(categoryName) ?? [];
    if (descs.length <= 1 && !description) return categoryName;
    const d = description?.trim();
    return d ? `${categoryName} (${d})` : categoryName;
  };

  // Per-transaction labels for recent list
  const recentTxWithLabels = expenses.slice(0, 10).map(e => ({
    ...e,
    label: catLabel(e.categoryName, e.description),
  }));

  // Transaction-level pie: group by "category (description)" key
  const COLORS = ['#6366f1','#f97316','#22c55e','#ef4444','#a855f7','#ec4899','#eab308','#0891b2','#6b7280','#14b8a6'];
  const txPieMap = new Map<string, { name: string; value: number; fill: string; icon: string }>();
  expenses.forEach((e, idx) => {
    const key = catLabel(e.categoryName, e.description);
    if (txPieMap.has(key)) {
      txPieMap.get(key)!.value += e.amount;
    } else {
      txPieMap.set(key, {
        name:  key,
        value: e.amount,
        fill:  COLORS[txPieMap.size % COLORS.length],
        icon:  e.categoryIcon,
      });
    }
  });
  const txPieData = [...txPieMap.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const hasAnyData = monthOverMonth.totalSpend.current > 0 || advice.length > 0;

  if (!hasAnyData) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
        <Card className="p-12 text-center border-dashed">
          <p className="text-3xl mb-3">🔍</p>
          <h2 className="text-base font-semibold text-foreground mb-2">No insights yet</h2>
          <p className="text-sm text-muted-foreground mb-5">Add expenses to start seeing personalised financial insights.</p>
          <Link href="/add-expense"><Button size="sm">Add your first expense</Button></Link>
        </Card>
      </div>
    );
  }

  const bySection = {
    critical: advice.filter(a => a.severity === 'critical').slice(0, 5),
    warning:  advice.filter(a => a.severity === 'warning').slice(0, 5),
    positive: advice.filter(a => a.severity === 'positive').slice(0, 5),
    info:     advice.filter(a => a.severity === 'info').slice(0, 5),
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

  return (
    <div className="space-y-6">

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

      {/* Summary card */}
      <SummaryCard data={data} fmt={fmt} />

      {/* ── Spending Overview ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{fmt(savingsAnalysis.totalSpent)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Savings</p>
          <p className={`text-xl font-bold tabular-nums ${savingsCls}`}>{fmt(savingsAnalysis.savings)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Savings Rate</p>
          <p className={`text-xl font-bold ${savingsCls}`}>
            {savingsAnalysis.savingsRate}%
            <span className="text-xs font-normal text-muted-foreground ml-1.5">({savingsAnalysis.classification})</span>
          </p>
        </Card>
      </div>

      {/* ── Monthly Breakdown ── */}
      {monthlyBreakdown && monthlyBreakdown.some(m => m.totalSpent > 0) && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">📅 Monthly Spending</h2>
          <Card className="p-4">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyBreakdown} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              {monthlyBreakdown.map((m, i) => (
                <div key={i} className="text-center">
                  <p className="text-xs font-medium text-foreground">{m.label}</p>
                  <p className="text-sm font-bold text-foreground tabular-nums">{fmt(m.totalSpent)}</p>
                  <p className="text-[10px] text-muted-foreground">{m.savingsRate}% saved</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Recent Transactions (category + description) ── */}
      {recentTxWithLabels.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">🧾 Recent Transactions</h2>
          <Card className="p-4">
            <div className="space-y-0">
              {recentTxWithLabels.map((tx, i) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{tx.categoryIcon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tx.label}</p>
                      <p className="text-[10px] text-muted-foreground">{tx.date}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 ml-3">{fmt(tx.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

                  {/* ── Top Categories ── */}
      {topCategories.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">🏆 Top Categories</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topCategories.map((c, i) => {
              // Find the top description for this category by amount
              const topDesc = expenses
                .filter(e => e.categoryName === c.categoryName && e.description?.trim())
                .sort((a, b) => b.amount - a.amount)[0]?.description;
              const label = catLabel(c.categoryName, topDesc);
              return (
              <Card key={`top-cat-${i}`} className="p-4 flex items-center gap-3">
                <span className="text-2xl shrink-0">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{label}</p>
                  <p className="text-xs text-muted-foreground">{fmt(c.total)}</p>
                </div>
                <span className="text-sm font-bold text-primary shrink-0">{c.percentageOfTotal}%</span>
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trends ── */}
      {categoryTrends.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">📈 Trends vs Last Month</h2>
          <Card className="p-4">
            <div className="space-y-2">
              {categoryTrends.slice(0, 6).map((t, i) => {
                // Find the most recent transaction description for this category
                const topTx = expenses.find(e => e.categoryName === t.categoryName && e.description);
                const label = topTx?.description ? `${t.categoryName} (${topTx.description})` : t.categoryName;
                return (
                <div key={`trend-${i}`} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{t.icon}</span>
                    <span className="text-sm text-foreground truncate">{label}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(t.currentSpend)}</span>
                    <span className={`text-sm font-bold ${trendCls(t.trend)}`}>
                      {trendIcon(t.trend)} {t.trend !== 'stable' && t.trend !== 'new' ? `${t.trendPct}%` : t.trend}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Anomalies ── */}
      {anomalies.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">⚡ Unusual Spending</h2>
          <div className="space-y-2">
            {anomalies.map((a, i) => {
              const topDesc = expenses
                .filter(e => e.categoryName === a.categoryName && e.description?.trim())
                .sort((a2, b) => b.amount - a2.amount)[0]?.description;
              const label = catLabel(a.categoryName, topDesc);
              return (
              <div key={`anomaly-${i}`} className="p-4 rounded-xl border bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800 flex gap-3">
                <span className="text-xl shrink-0">{a.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{label} — {a.spikeRatio}× spike</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This month: {fmt(a.currentSpend)} · Recent avg: {fmt(a.avgPrevSpend)}
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Rule-based advice sections ── */}
      {SECTIONS.map(section => {
        const cards = bySection[section.key];
        return (
          <div key={section.key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
              {cards.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${section.badge}`}>{cards.length}</span>
              )}
              <span className="text-xs text-muted-foreground">{section.sublabel}</span>
            </div>
            {cards.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-1">{section.empty}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cards.map(card => <InsightCard key={card.id} card={card} badge={section.badge} bg={section.bg} />)}
              </div>
            )}
          </div>
        );
      })}

      {/* ── AI Suggestions ── */}
      {aiSuggestions && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">🤖 AI Suggestions</h2>
          <Card className="p-5 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20">
            <div className="flex gap-3">
              <span className="text-xl shrink-0">✨</span>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{aiSuggestions}</p>
            </div>
          </Card>
        </div>
      )}

      {/* ── Category chart + Goals ── */}
      {(txPieData.length > 0 || goalProbabilities.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {txPieData.length > 0 && <CategoryPie data={txPieData} />}
          {goalProbabilities.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Goal Progress</h3>
              <div className="space-y-3">
                {goalProbabilities.slice(0, 4).map(g => <GoalCard key={g.goalId} goal={g} fmt={fmt} />)}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

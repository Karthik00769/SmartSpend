'use client';

/**
 * app/(app)/insights/page.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Full Insights Engine output rendered as a rich dashboard.
 *
 * Sections:
 *  1. Financial Health Score — radial ring + 4 sub-scores
 *  2. Advice Cards          — severity-sorted, with CTAs
 *  3. Period Comparison     — WoW + MoM deltas
 *  4. Goal Probabilities    — probability bars per active goal
 *  5. Spending Pattern      — peak day, streak, largest tx
 */

import Link                 from 'next/link';
import { useSmartSpend }    from '@/context/smartspend-context';
import { useInsights }      from '@/hooks/use-insights';
import { Card }             from '@/components/ui/card';
import { Button }           from '@/components/ui/button';
import { Progress }         from '@/components/ui/progress';
import type {
  TextAdvice,
  AdviceSeverity,
  MetricDelta,
  GoalProbabilityResult,
}                           from '@/lib/insights-engine/types';

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<AdviceSeverity, { card: string; badge: string; icon: string }> = {
  critical: {
    card:  'border-red-300    dark:border-red-800    bg-red-50    dark:bg-red-950/30',
    badge: 'bg-red-100        dark:bg-red-900/50     text-red-700 dark:text-red-400',
    icon:  '🚨',
  },
  warning: {
    card:  'border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30',
    badge: 'bg-yellow-100     dark:bg-yellow-900/50  text-yellow-700 dark:text-yellow-400',
    icon:  '⚠️',
  },
  positive: {
    card:  'border-green-300  dark:border-green-800  bg-green-50  dark:bg-green-950/30',
    badge: 'bg-green-100      dark:bg-green-900/50   text-green-700 dark:text-green-400',
    icon:  '✅',
  },
  info: {
    card:  'border-blue-300   dark:border-blue-800   bg-blue-50   dark:bg-blue-950/30',
    badge: 'bg-blue-100       dark:bg-blue-900/50    text-blue-700 dark:text-blue-400',
    icon:  'ℹ️',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single advice card */
function AdviceCard({ card }: { card: TextAdvice }) {
  const s = SEVERITY_STYLE[card.severity];
  return (
    <Card className={`p-5 border-2 ${s.card}`}>
      <div className="flex gap-4">
        <span className="text-3xl shrink-0">{card.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-foreground leading-snug">
              {card.headline}
            </h3>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${s.badge}`}>
              {card.severity}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{card.detail}</p>
          {card.actionLabel && card.actionHref && (
            <Link href={card.actionHref}>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3">
                {card.actionLabel} →
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Delta badge: "↑ 18%" or "↓ 7%" */
function DeltaBadge({ delta }: { delta: MetricDelta }) {
  if (!delta.isSignificant) {
    return <span className="text-xs text-muted-foreground">→ stable</span>;
  }
  const up = delta.direction === 'up';
  return (
    <span className={`text-xs font-semibold ${up ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(delta.percentage)}%
    </span>
  );
}

/** Health score ring (SVG) */
function ScoreRing({ score }: { score: number }) {
  const r   = 40;
  const c   = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;

  const color =
    pct >= 80 ? '#16a34a' :
    pct >= 60 ? '#65a30d' :
    pct >= 40 ? '#F97316' : '#EF4444';

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" stroke="currentColor"
          className="text-muted/30" />
        <circle
          cx="50" cy="50" r={r}
          fill="none" strokeWidth="8"
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="text-center -mt-16">
        <p className="text-2xl font-bold text-foreground">{score}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">/ 100</p>
      </div>
    </div>
  );
}

/** Sub-score row */
function SubScore({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? 'bg-green-500' :
    value >= 60 ? 'bg-indigo-500' :
    value >= 40 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/** Comparison row */
function CompareRow({
  label,
  delta,
  formatFn = (v: number) => `$${v.toFixed(0)}`,
}: {
  label:    string;
  delta:    MetricDelta;
  formatFn?: (v: number) => string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-foreground">{formatFn(delta.current)}</span>
        <span className="text-xs text-muted-foreground ml-2 mr-1">vs {formatFn(delta.previous)}</span>
        <DeltaBadge delta={delta} />
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-48 bg-muted rounded-xl" />
        <div className="lg:col-span-2 h-48 bg-muted rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl" />)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { period }                            = useSmartSpend();
  const { data, loading, error, markAllRead }   = useInsights({ ...period });

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Financial Insights</h1>
          <p className="text-muted-foreground">Analysing your spending patterns…</p>
        </div>
        <InsightsSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Financial Insights</h1>
        </div>
        <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-red-700 dark:text-red-400">⚠️ {error ?? 'Failed to load insights.'}</p>
        </Card>
      </div>
    );
  }

  const { score, advice, weekOverWeek, monthOverMonth, goalProbabilities, pattern } = data;

  //  Separate score card from the rest of the advice
  const scoreCard   = advice.find(a => a.tag === 'summary' && a.id.startsWith('summary:score'));
  const actionCards = advice.filter(a => a !== scoreCard);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Financial Insights</h1>
          <p className="text-muted-foreground">
            AI-powered analysis for {data.period.year} — Month {data.period.month}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead}>
          Mark all read
        </Button>
      </div>

      {/* ── Section 1: Health Score ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score ring */}
        <Card className="p-6 flex flex-col items-center justify-center gap-4">
          <h2 className="text-base font-semibold text-foreground text-center">Financial Health</h2>
          <ScoreRing score={score.overall} />
          <p className="text-xs text-muted-foreground text-center -mt-4">
            {score.overall >= 80 ? 'Excellent 🌟' :
             score.overall >= 60 ? 'Good 👍'        :
             score.overall >= 40 ? 'Fair ⚠️'        : 'Needs attention 🚩'}
          </p>
        </Card>

        {/* Sub-scores */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-foreground mb-5">Score Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <SubScore label="Savings Rate (35%)"       value={score.savingsRate} />
            <SubScore label="Budget Compliance (25%)"  value={score.budgetCompliance} />
            <SubScore label="Goal Progress (25%)"      value={score.goalProgress} />
            <SubScore label="Spending Control (15%)"   value={score.spendingControl} />
          </div>

          {/* Key metrics row */}
          {monthOverMonth && (
            <div className="mt-5 pt-5 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Spent',       val: `$${monthOverMonth.totalSpend.current.toFixed(0)}`,  delta: monthOverMonth.totalSpend,  up: false },
                { label: 'Saved',       val: `$${monthOverMonth.savings.current.toFixed(0)}`,     delta: monthOverMonth.savings,     up: true  },
                { label: 'Savings %',   val: `${monthOverMonth.savingsRate.current}%`,            delta: monthOverMonth.savingsRate,  up: true  },
                { label: 'Transactions',val: String(monthOverMonth.txCount.current),              delta: monthOverMonth.txCount,     up: false },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                  <p className="text-lg font-bold text-foreground">{m.val}</p>
                  <DeltaBadge delta={{
                    ...m.delta,
                    // Invert direction coloring for "up is bad" metrics (spent, txCount)
                    direction: m.up
                      ? m.delta.direction
                      : m.delta.direction === 'up' ? 'down'
                        : m.delta.direction === 'down' ? 'up'
                        : 'stable',
                  }} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Section 2: Advice Cards ── */}
      {actionCards.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Recommendations <span className="text-muted-foreground text-sm font-normal">({actionCards.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actionCards.map(card => (
              <AdviceCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}

      {/* ── Section 3: Period Comparisons ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Week-over-week */}
        {weekOverWeek && (
          <Card className="p-6">
            <h2 className="text-base font-semibold text-foreground mb-1">Week over Week</h2>
            <p className="text-xs text-muted-foreground mb-4">
              {weekOverWeek.currentWeek.startDate} → {weekOverWeek.currentWeek.endDate}
            </p>
            <CompareRow label="Total Spend"   delta={weekOverWeek.totalSpend} />
            <CompareRow label="Transactions"  delta={weekOverWeek.txCount}
              formatFn={v => `${v} txns`} />
            <CompareRow label="Daily Average" delta={weekOverWeek.dailyAvg} />
            {weekOverWeek.categories.filter(c => c.delta.isSignificant).slice(0, 4).map(c => (
              <CompareRow
                key={c.categoryId}
                label={`${c.icon} ${c.categoryName}`}
                delta={c.delta}
              />
            ))}
          </Card>
        )}

        {/* Month-over-month */}
        {monthOverMonth && (
          <Card className="p-6">
            <h2 className="text-base font-semibold text-foreground mb-1">Month over Month</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Month {monthOverMonth.currentMonth.month} vs Month {monthOverMonth.previousMonth.month}
            </p>
            <CompareRow label="Total Spend"  delta={monthOverMonth.totalSpend} />
            <CompareRow label="Savings"      delta={monthOverMonth.savings} />
            <CompareRow label="Savings Rate" delta={monthOverMonth.savingsRate}
              formatFn={v => `${v}%`} />
            <CompareRow label="Daily Avg"    delta={monthOverMonth.dailyAvg} />
            {monthOverMonth.categories.filter(c => c.delta.isSignificant).slice(0, 3).map(c => (
              <CompareRow
                key={c.categoryId}
                label={`${c.icon} ${c.categoryName}`}
                delta={c.delta}
              />
            ))}
          </Card>
        )}
      </div>

      {/* ── Section 4: Goal Probabilities ── */}
      {goalProbabilities.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">Goal Achievement Probability</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goalProbabilities.map(g => (
              <GoalProbCard key={g.goalId} goal={g} />
            ))}
          </div>
        </div>
      )}

      {/* ── Section 5: Spending Patterns ── */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-foreground mb-5">Spending Patterns</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Peak Day',          value: pattern.peakDayOfWeek,        icon: '📅' },
            { label: 'Quietest Day',      value: pattern.lowestDayOfWeek,      icon: '😴' },
            { label: 'Peak Week',         value: `Week ${pattern.peakWeekOfMonth} of month`, icon: '📆' },
            { label: 'Avg Transaction',   value: `$${pattern.avgTransactionSize.toFixed(2)}`, icon: '💳' },
            { label: 'Largest Purchase',  value: `$${pattern.largestTransaction.toFixed(2)}`, icon: '💸' },
            { label: 'On-Budget Streak',  value: `${pattern.streakDaysUnderBudget} days`,    icon: '🔥' },
          ].map(p => (
            <div key={p.label} className="text-center p-3 rounded-xl bg-muted/50">
              <p className="text-2xl mb-1">{p.icon}</p>
              <p className="text-sm font-semibold text-foreground">{p.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{p.label}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Goal probability card ─────────────────────────────────────────────────────

function GoalProbCard({ goal }: { goal: GoalProbabilityResult }) {
  const riskColor: Record<string, string> = {
    completed:  'text-green-600  dark:text-green-400',
    on_track:   'text-blue-600   dark:text-blue-400',
    at_risk:    'text-yellow-600 dark:text-yellow-400',
    behind:     'text-red-600    dark:text-red-400',
  };

  return (
    <Card className="p-5">
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground text-sm truncate">{goal.title}</h3>
          <p className="text-xs text-muted-foreground">
            ${goal.currentAmount.toLocaleString()} / ${goal.targetAmount.toLocaleString()}
          </p>
        </div>
        <span className={`text-2xl font-bold shrink-0 ml-3 ${riskColor[goal.risk]}`}>
          {goal.probability}%
        </span>
      </div>

      {/* Probability bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            goal.probability >= 70 ? 'bg-blue-500' :
            goal.probability >= 40 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${goal.probability}%` }}
        />
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>📅 {goal.daysRemaining} days remaining</p>
        <p>💰 Need ${goal.requiredDailyAmount}/day · Saving ${goal.actualDailyRate}/day</p>
        {goal.weeksNeeded > 0 && (
          <p>⏱ {goal.weeksNeeded} weeks at current rate</p>
        )}
      </div>
    </Card>
  );
}

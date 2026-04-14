'use client';

import { useState } from 'react';
import { useSmartSpend }    from '@/context/smartspend-context';
import { useInsights }      from '@/hooks/use-insights';
import { GoalForm }         from '@/components/sections/goals/goal-form';
import { Card }             from '@/components/ui/card';
import { Input }            from '@/components/ui/input';
import { Button }           from '@/components/ui/button';
import { getCurrencySymbol } from '@/lib/currency';
import type { GoalDTO }     from '@/types/api';
import type { GoalProbabilityResult } from '@/lib/insights-engine/types';

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  active:    { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',     label: '🎯 Active' },
  paused:    { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',     label: '⏸ Paused' },
  completed: { cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400', label: '🏆 Completed' },
  failed:    { cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',         label: '❌ Failed' },
  cancelled: { cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',     label: '🚫 Cancelled' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.active;
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.label}
    </span>
  );
}

function barColor(pct: number, status: string): string {
  if (status === 'completed') return 'bg-green-500';
  if (status === 'failed')    return 'bg-red-500';
  if (status === 'paused')    return 'bg-gray-400';
  if (pct >= 100)             return 'bg-green-500';
  if (pct >= 75)              return 'bg-blue-500';
  if (pct >= 40)              return 'bg-indigo-500';
  return 'bg-muted-foreground/50';
}

function RiskBadge({ risk }: { risk: GoalProbabilityResult['risk'] }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400',
    on_track:  'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
    at_risk:   'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400',
    behind:    'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  };
  const labels: Record<string, string> = {
    completed: '✅ On Track', on_track: '✅ On Track',
    at_risk: '⏳ At Risk', behind: '🚩 Behind',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[risk]}`}>
      {labels[risk]}
    </span>
  );
}

function GoalCard({
  goal,
  probability,
}: {
  goal:        GoalDTO;
  probability: GoalProbabilityResult | undefined;
}) {
  const { depositToGoal, updateGoal, deleteGoal, fmt, currency } = useSmartSpend();
  const symbol = getCurrencySymbol(currency);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing,    setDepositing]    = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  const pct       = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const daysLeft  = goal.daysRemaining ?? 0;
  const isTerminal = goal.status === 'completed' || goal.status === 'failed' || goal.status === 'cancelled';

  const handleDeposit = async () => {
    const val = parseFloat(depositAmount);
    if (!val || val <= 0) return;
    setDepositing(true);
    const ok = await depositToGoal(goal.id, val);
    if (ok) setDepositAmount('');
    setDepositing(false);
  };

  const handleTogglePause = async () => {
    const newStatus = goal.status === 'paused' ? 'active' : 'paused';
    await updateGoal(goal.id, { status: newStatus });
  };

  const handleDelete = async () => {
    if (!confirm(`Delete goal "${goal.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteGoal(goal.id);
    setDeleting(false);
  };

  return (
    <Card className={`p-5 border transition-colors ${
      goal.status === 'completed' ? 'border-green-300 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10' :
      goal.status === 'failed'    ? 'border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10' :
      'border-border/50 hover:border-primary/40'
    }`}>

      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground text-base truncate">{goal.title}</h3>
          {goal.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{goal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={goal.status} />
          {probability && goal.status === 'active' && <RiskBadge risk={probability.risk} />}
        </div>
      </div>

      {/* Amounts */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <span className="text-xl font-bold text-foreground tabular-nums">{fmt(goal.savedAmount)}</span>
          <span className="text-sm text-muted-foreground ml-1">/ {fmt(goal.targetAmount)}</span>
        </div>
        <span className="text-sm font-bold text-primary">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(pct, goal.status)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Sub-line */}
      <div className="flex justify-between text-xs text-muted-foreground mb-4">
        <span>
          {goal.status === 'completed' ? '🎉 Goal reached!'
            : goal.status === 'failed' ? '⏰ Deadline passed'
            : `${fmt(remaining)} remaining`}
        </span>
        <span>
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
            : goal.deadline ? `Due ${goal.deadline}` : ''}
        </span>
      </div>

      {/* Deposit */}
      {!isTerminal && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs select-none">
              {symbol}
            </span>
            <Input
              type="number" placeholder="0.00" min="0.01" step="0.01"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              className="h-9 pl-7 text-sm bg-muted/30"
              disabled={depositing || goal.status === 'paused'}
            />
          </div>
          <Button
            size="sm" onClick={handleDeposit}
            disabled={depositing || !depositAmount || goal.status === 'paused'}
            className="h-9 px-4 shrink-0 font-bold"
          >
            {depositing ? '…' : 'Add Savings'}
          </Button>
        </div>
      )}

      {/* AI recommendation */}
      {probability?.recommendation && goal.status === 'active' && (
        <p className="text-xs text-muted-foreground italic bg-muted/20 p-2.5 rounded-lg border border-border/30 mb-3">
          "{probability.recommendation}"
        </p>
      )}

      {/* Actions row */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {goal.priority && (
            <span className={`px-1.5 py-0.5 rounded ${
              goal.priority === 'high'   ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' :
              goal.priority === 'medium' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400' :
              'bg-muted text-muted-foreground'
            }`}>
              {goal.priority}
            </span>
          )}
          {probability && goal.status === 'active' && (
            <span>📊 {probability.probability}% prob.</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {!isTerminal && (
            <button
              onClick={handleTogglePause}
              className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
            >
              {goal.status === 'paused' ? '▶ Resume' : '⏸ Pause'}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded bg-muted hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors disabled:opacity-50"
          >
            {deleting ? '…' : '🗑️'}
          </button>
        </div>
      </div>
    </Card>
  );
}

function GoalsSkeleton() {
  return (
    <div className="animate-pulse grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="h-96 bg-muted rounded-xl" />
      <div className="lg:col-span-2 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-44 bg-muted rounded-xl" />)}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { goals, goalsLoading, goalsError, period, fmt } = useSmartSpend();
  const { data: insightsData } = useInsights({ ...period });

  const probMap = new Map(
    insightsData?.goalProbabilities.map(g => [g.goalId, g]) ?? [],
  );

  const active    = goals.filter(g => g.status === 'active');
  const paused    = goals.filter(g => g.status === 'paused');
  const completed = goals.filter(g => g.status === 'completed');
  const failed    = goals.filter(g => g.status === 'failed');

  if (goalsLoading) return <GoalsSkeleton />;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Financial Goals</h1>
        <p className="text-muted-foreground text-sm">
          Track savings goals with AI-powered achievement probability.
        </p>
      </div>

      {goalsError && (
        <Card className="p-6 mb-8 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-red-700 dark:text-red-400">⚠️ {goalsError}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <GoalForm />
        </div>

        <div className="lg:col-span-2 space-y-8">
          {goals.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-5xl mb-4">🎯</p>
              <h3 className="text-lg font-semibold text-foreground mb-2">No goals yet</h3>
              <p className="text-muted-foreground text-sm">
                Create your first savings goal to start tracking progress.
              </p>
            </Card>
          ) : (
            <>
              {active.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold text-foreground mb-3">Active</h2>
                  <div className="space-y-4">
                    {active.map(g => <GoalCard key={g.id} goal={g} probability={probMap.get(g.id)} />)}
                  </div>
                </section>
              )}
              {paused.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold text-muted-foreground mb-3">Paused</h2>
                  <div className="space-y-4">
                    {paused.map(g => <GoalCard key={g.id} goal={g} probability={probMap.get(g.id)} />)}
                  </div>
                </section>
              )}
              {completed.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold text-green-600 dark:text-green-400 mb-3">Completed 🏆</h2>
                  <div className="space-y-4">
                    {completed.map(g => <GoalCard key={g.id} goal={g} probability={undefined} />)}
                  </div>
                </section>
              )}
              {failed.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold text-red-600 dark:text-red-400 mb-3">Missed Deadline</h2>
                  <div className="space-y-4">
                    {failed.map(g => <GoalCard key={g.id} goal={g} probability={undefined} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

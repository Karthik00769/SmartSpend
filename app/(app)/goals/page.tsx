'use client';

/**
 * app/(app)/goals/page.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Goals page — reads from SmartSpend context.
 * Renders GoalForm (create) + live goal list with probability data
 * from the Insights Engine.
 */

import { useSmartSpend } from '@/context/smartspend-context';
import { useInsights } from '@/hooks/use-insights';
import { GoalForm } from '@/components/sections/goals/goal-form';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { GoalProbabilityResult } from '@/lib/insights-engine/types';

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: GoalProbabilityResult['risk'] }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-100  dark:bg-green-950/40  text-green-700  dark:text-green-400',
    on_track: 'bg-blue-100   dark:bg-blue-950/40   text-blue-700   dark:text-blue-400',
    at_risk: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400',
    behind: 'bg-red-100    dark:bg-red-950/40    text-red-700    dark:text-red-400',
  };
  const labels: Record<string, string> = {
    completed: '🏆 Completed',
    on_track: '✅ On Track',
    at_risk: '⏳ At Risk',
    behind: '🚩 Behind',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[risk]}`}>
      {labels[risk]}
    </span>
  );
}

// ─── Goal card ────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  probability,
}: {
  goal: ReturnType<typeof useSmartSpend>['goals'][number];
  probability: GoalProbabilityResult | undefined;
}) {
  const pct = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
  const daysLeft = goal.daysRemaining ?? 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-foreground">{goal.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            ${goal.currentAmount.toLocaleString()} of ${goal.targetAmount.toLocaleString()} · {daysLeft}d left
          </p>
        </div>
        {probability && <RiskBadge risk={probability.risk} />}
      </div>

      {/* Progress bar */}
      <Progress value={pct} className="h-2 mb-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{pct}% complete</span>
        {probability && (
          <span className="font-medium">{probability.probability}% probability</span>
        )}
      </div>

      {/* Probability detail */}
      {probability && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed border-t border-border pt-3">
          {probability.recommendation}
        </p>
      )}

      {/* Milestones mini-list */}
      {probability && probability.milestones.length > 0 && (
        <div className="mt-3 flex gap-3 flex-wrap">
          {probability.milestones.map(m => (
            <div
              key={m.pct}
              className={`text-xs px-2 py-1 rounded-full border ${m.reached
                  ? 'bg-green-100 dark:bg-green-950/40 border-green-300 dark:border-green-800 text-green-700 dark:text-green-400'
                  : 'bg-muted border-border text-muted-foreground'
                }`}
            >
              {m.reached ? '✓' : '○'} {m.pct}%
              {!m.reached && m.estimatedDate !== '—' && (
                <span className="ml-1 opacity-70">{m.estimatedDate}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function GoalsSkeleton() {
  return (
    <div className="animate-pulse grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="h-96 bg-muted rounded-xl" />
      <div className="lg:col-span-2 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-muted rounded-xl" />)}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { goals, goalsLoading, goalsError, period } = useSmartSpend();

  // Fetch insight engine for probability data
  const { data: insightsData } = useInsights({ ...period });

  const probMap = new Map(
    insightsData?.goalProbabilities.map(g => [g.goalId, g]) ?? [],
  );

  if (goalsLoading) return <GoalsSkeleton />;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Financial Goals</h1>
        <p className="text-muted-foreground">
          Set and track your short and long-term goals — with AI-powered achievement probability
        </p>
      </div>

      {goalsError && (
        <Card className="p-6 mb-8 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-red-700 dark:text-red-400">⚠️ {goalsError}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create form */}
        <div className="lg:col-span-1">
          <GoalForm />
        </div>

        {/* Goal list */}
        <div className="lg:col-span-2">
          {goals.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-5xl mb-4">🎯</p>
              <h3 className="text-lg font-semibold text-foreground mb-2">No goals yet</h3>
              <p className="text-muted-foreground">
                Create your first savings goal to start tracking your progress.
              </p>
            </Card>
          ) : (
            <div className="space-y-8">
              {(() => {
                const shortTerm = goals.filter(g => (g.daysRemaining ?? 0) <= 365);
                const longTerm = goals.filter(g => (g.daysRemaining ?? 0) > 365);

                return (
                  <>
                    {shortTerm.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4 text-foreground/90">Short-Term Goals (≤ 1 Year)</h2>
                        <div className="space-y-4">
                          {shortTerm.map((goal: any) => (
                            <GoalCard
                              key={goal.id}
                              goal={goal}
                              probability={probMap.get(goal.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {longTerm.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4 text-foreground/90 mt-8">Long-Term Goals (&gt; 1 Year)</h2>
                        <div className="space-y-4">
                          {longTerm.map((goal: any) => (
                            <GoalCard
                              key={goal.id}
                              goal={goal}
                              probability={probMap.get(goal.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

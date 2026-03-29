'use client';

import { useDashboardSummary } from '@/hooks/use-dashboard-summary';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { SpendingChart } from '@/components/sections/dashboard/spending-chart';

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = useDashboardSummary();

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your financial overview.</p>
        </div>
        <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-700 dark:text-red-400 font-medium">⚠️ {error || 'Failed to load'}</p>
          <button 
            onClick={refresh} 
            className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-500 rounded text-sm hover:bg-red-200 dark:hover:bg-red-900/60 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Determine health score color logic dynamically based on status returned from API
  const healthColors = {
    excellent: 'text-green-500',
    good: 'text-green-400',
    warning: 'text-yellow-500',
    critical: 'text-red-500'
  };

  const statusColor = healthColors[data.financialHealthScore.status] || 'text-muted-foreground';

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's your intelligent financial overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/add-expense?section=scan"
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors"
          >
            <span className="text-lg">📸</span> Scan Receipt
          </a>
          <a
            href="/add-expense"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <span className="text-lg">+</span> Add Expense
          </a>
        </div>
      </div>

      {data.totalSpending === 0 && data.budgetProgress.length === 0 && data.recentInsights.length === 0 && (
        <Card className="p-12 text-center flex flex-col items-center justify-center border-dashed">
          <div className="text-4xl mb-4">🌱</div>
          <h2 className="text-xl font-bold text-foreground mb-2">No data yet.</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Your dashboard is looking a little empty. Add your first expense or set up a budget to start seeing insights!
          </p>
          <a
            href="/add-expense"
            className="px-6 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Add Your First Expense
          </a>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Spending</h3>
          <p className="text-4xl font-bold text-foreground">
            ${data.totalSpending.toFixed(2)}
          </p>
          <span className="text-xs text-muted-foreground mt-2 inline-block">This month</span>
        </Card>

        <Card className="p-6 flex flex-col justify-center">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Savings Rate</h3>
          <p className="text-4xl font-bold text-foreground">
            {data.savingsRate}%
          </p>
          <Progress value={data.savingsRate} className="h-2 mt-4" />
        </Card>

        <Card style={{ borderLeftColor: 'currentColor' }} className={`p-6 flex flex-col justify-center border-l-4 border ${statusColor} bg-card rounded-xl`}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Financial Health Score</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold">
              {data.financialHealthScore.score}
            </p>
            <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
              {data.financialHealthScore.status}
            </span>
          </div>
          <span className="text-xs text-muted-foreground mt-2 inline-block">Score / 100</span>
        </Card>
      </div>

      {data.monthlyTrend && data.monthlyTrend.length > 0 && (
        <SpendingChart data={data.monthlyTrend} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Budget Progress Component List */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-6">Budget Progress</h3>
          {data.budgetProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No budgets set this month.</p>
          ) : (
            <div className="space-y-6">
              {data.budgetProgress.map((b, i) => (
                <div key={i}>
                  <div className="flex justify-between items-end mb-2">
                    <span className="font-medium text-sm">{b.category}</span>
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-foreground">${b.spent.toFixed(2)} / ${b.allocated.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">${b.remaining.toFixed(2)} left</span>
                    </div>
                  </div>
                  <Progress 
                    value={b.usedPct || 0} 
                    className={`h-2 ${b.isOverBudget ? 'bg-red-100 dark:bg-red-950' : ''}`} 
                    // To strictly emulate shadcn internal indicator overrides, we just rely on the wrapper for now 
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Insights Component List */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-6">Recent Insights</h3>
          {data.recentInsights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No insights generated yet. Add expenses to begin analysis.</p>
          ) : (
             <div className="space-y-4">
               {data.recentInsights.map((insight) => (
                 <div key={insight.id} className="p-4 rounded-lg bg-muted/50 border border-border">
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                       {insight.type.replace('_', ' ')}
                     </span>
                     <span className="text-xs text-muted-foreground">
                        {insight.minutesAgo < 60 
                          ? `${insight.minutesAgo}m ago` 
                          : `${Math.floor(insight.minutesAgo/60)}h ago`}
                     </span>
                   </div>
                   <p className="text-sm text-foreground leading-relaxed">{insight.content}</p>
                 </div>
               ))}
             </div>
          )}
        </Card>

      </div>
    </div>
  );
}

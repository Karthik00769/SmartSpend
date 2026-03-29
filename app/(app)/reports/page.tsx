'use client';

import { useState, useEffect } from 'react';
import { ExpenseSummary } from '@/components/sections/reports/expense-summary';
import { HealthScore } from '@/components/sections/reports/health-score';
import { Card } from '@/components/ui/card';
import { apiGet } from '@/lib/api-client';

interface ReportData {
  monthlyData: Array<{ month: string; income: number; expenses: number; savings: number }>;
  health: {
    score: number;
    status: string;
    details: any;
  };
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ReportData>('/api/reports')
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to fetch reports');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-20 bg-muted rounded-xl w-1/3 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-96 bg-muted rounded-xl" />
          <div className="h-96 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Reports & Insights</h1>
        </div>
        <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-red-700 dark:text-red-400">⚠️ {error || 'Failed to load'}</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Reports & Insights</h1>
        <p className="text-muted-foreground">Analyze your spending patterns and financial health</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {data.monthlyData.length > 0 ? (
            <ExpenseSummary data={data.monthlyData} />
          ) : (
             <Card className="p-12 text-center flex flex-col items-center justify-center border-dashed">
                <div className="text-4xl mb-4">📈</div>
                <h2 className="text-xl font-bold text-foreground mb-2">No historical data</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                  We don't have enough data yet to show historical trends.
                </p>
              </Card>
          )}
        </div>
        <div>
          <HealthScore score={data.health.score} details={data.health.details} />
        </div>
      </div>
    </div>
  );
}

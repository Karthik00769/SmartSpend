'use client';

import { useState, useEffect } from 'react';
import { ExpenseSummary } from '@/components/sections/reports/expense-summary';
import { HealthScore } from '@/components/sections/reports/health-score';
import { Card } from '@/components/ui/card';
import { apiGet } from '@/lib/api-client';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface ReportData {
  monthlyData: Array<{ month: string; income: number; expenses: number; savings: number }>;
  health: {
    score: number;
    status: string;
    details: any;
  };
}

import { useSmartSpend } from '@/context/smartspend-context';

export default function ReportsPage() {
  const { expenses, fmt } = useSmartSpend();
  const [data, setData] = useState<ReportData | null>(null);
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<ReportData>(`/api/reports?months=${months}`)
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
  }, [months, refreshTick, expenses]);

  if (loading && !data) {
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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-0.5">Reports</h1>
          <p className="text-sm text-muted-foreground">Spending patterns and financial health</p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={String(months)} onValueChange={v => setMonths(Number(v))}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 Months</SelectItem>
              <SelectItem value="6">Last 6 Months</SelectItem>
              <SelectItem value="12">Last 12 Months</SelectItem>
              <SelectItem value="24">Last 2 Years</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => setRefreshTick(t => t + 1)}
            disabled={loading}
            title="Refresh"
            className="w-9 h-9 flex items-center justify-center rounded-md border border-border
              text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
              className={loading ? 'animate-spin' : ''}>
              <path d="M13 7A6 6 0 1 1 7 1" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round"/>
              <path d="M13 1v6h-6" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {error ? (
            <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
              <p className="text-red-700 dark:text-red-400">⚠️ {error}</p>
            </Card>
          ) : data && data.monthlyData.length > 0 ? (
            <ExpenseSummary data={data.monthlyData} fmt={fmt} />
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
          {data && (
            <HealthScore score={data.health.score} details={data.health.details} />
          )}
        </div>
      </div>
    </div>
  );
}

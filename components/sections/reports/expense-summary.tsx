'use client';

import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ExpenseSummaryProps {
  data: Array<{ month: string; income: number; expenses: number; savings: number }>;
}

export function ExpenseSummary({ data }: ExpenseSummaryProps) {
  const totalExpenses = data.reduce((sum, item) => sum + item.expenses, 0);
  const averageExpenses = (totalExpenses / data.length).toFixed(2);
  const totalSavings = data.reduce((sum, item) => sum + item.savings, 0);

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-foreground mb-6">Spending Overview</h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-foreground">${totalExpenses.toFixed(2)}</p>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Average/Month</p>
          <p className="text-2xl font-bold text-foreground">${averageExpenses}</p>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Savings</p>
          <p className="text-2xl font-bold text-accent">${totalSavings.toFixed(2)}</p>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" stroke="var(--muted-foreground)" />
            <YAxis stroke="var(--muted-foreground)" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card)',
                border: `1px solid var(--border)`,
                borderRadius: '8px',
              }}
              formatter={(value) => `$${Number(value).toFixed(2)}`}

            />
            <Line type="monotone" dataKey="expenses" stroke="var(--destructive)" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="savings" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

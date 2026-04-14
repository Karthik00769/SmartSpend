'use client';

import { Card } from '@/components/ui/card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

interface ExpenseSummaryProps {
  data: Array<{ month: string; income: number; expenses: number; savings: number }>;
  fmt: (amount: number) => string;
}

export function ExpenseSummary({ data, fmt }: ExpenseSummaryProps) {
  const totalExpenses   = data.reduce((sum, item) => sum + item.expenses, 0);
  const averageExpenses = data.length > 0 ? totalExpenses / data.length : 0;
  const totalSavings    = data.reduce((sum, item) => sum + item.savings, 0);

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-foreground mb-6">Spending Overview</h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-foreground">{fmt(totalExpenses)}</p>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Average/Month</p>
          <p className="text-2xl font-bold text-foreground">{fmt(averageExpenses)}</p>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Savings</p>
          <p className="text-2xl font-bold text-accent">{fmt(totalSavings)}</p>
        </div>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              padding={{ left: 10, right: 10 }}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => fmt(v)}
              domain={[0, 'auto']}
              allowDecimals={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff',
              }}
              formatter={(value: number) => [fmt(value), '']}
            />
            <Line
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="#6366f1"
              strokeWidth={3}
              dot={{ r: 4, fill: '#818cf8', stroke: '#6366f1', strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="savings"
              name="Savings"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ r: 4, fill: '#34d399', stroke: '#10b981', strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

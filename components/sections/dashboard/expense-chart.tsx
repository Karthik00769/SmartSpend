'use client';

import { Card } from '@/components/ui/card';
import { ChartDataPoint } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ExpenseChartProps {
  data: ChartDataPoint[];
  /** Currency formatter — e.g. fmt from useSmartSpend(). */
  fmt?: (amount: number) => string;
}

export function ExpenseChart({ data, fmt }: ExpenseChartProps) {
  const format = fmt ?? ((n: number) => `$${Number(n).toFixed(2)}`);

  return (
    <Card className="p-6 mb-8">
      <h3 className="text-lg font-semibold text-foreground mb-4">Expense Breakdown</h3>
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke="var(--muted-foreground)" />
            <YAxis stroke="var(--muted-foreground)" tickFormatter={(v) => format(Number(v))} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card)',
                border: `1px solid var(--border)`,
                borderRadius: '8px',
              }}
              formatter={(value) => format(Number(value))}
            />
            <Bar dataKey="value" fill="var(--accent)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

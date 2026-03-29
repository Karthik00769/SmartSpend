'use client';

import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

interface SpendingChartProps {
  data: Array<{
    label: string;
    spent: number;
  }>;
}

export function SpendingChart({ data }: SpendingChartProps) {
  // Recharts renders SVG — CSS custom properties (var(--primary)) do NOT
  // resolve inside SVG presentation attributes like `fill`.
  // We read the computed color once after mount and pass it as a real value.
  const [barColor, setBarColor] = useState('#16a34a');

  useEffect(() => {
    try {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim();
      if (raw) {
        // --primary is an oklch() value string (e.g. "0.46 0.16 143")
        // Wrap it in oklch() and resolve via a temporary DOM element
        const tmp = document.createElement('div');
        tmp.style.color = raw.startsWith('oklch') ? raw : `oklch(${raw})`;
        tmp.style.position = 'absolute';
        tmp.style.visibility = 'hidden';
        document.body.appendChild(tmp);
        const resolved = getComputedStyle(tmp).color; // returns rgb(...)
        document.body.removeChild(tmp);
        if (resolved && resolved !== 'rgba(0, 0, 0, 0)') {
          setBarColor(resolved);
        }
      }
    } catch {
      // keep default
    }
  }, []);

  // Guard: filter out NaN/null values that would break the chart
  const validData = data.filter(
    (d) => d && typeof d.spent === 'number' && !isNaN(d.spent),
  );

  if (validData.length === 0) return null;

  const maxSpent = Math.max(...validData.map((d) => d.spent), 1);
  const yAxisMax = Math.ceil(maxSpent * 1.2); // 20% headroom so bars don't touch top

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-foreground mb-6">Spending Trends</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={validData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
            <XAxis
              dataKey="label"
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={[0, yAxisMax]}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
              labelStyle={{ fontWeight: 'bold' }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spent']}
            />
            <Bar dataKey="spent" radius={[4, 4, 0, 0]}>
              {validData.map((_, index) => (
                <Cell key={index} fill={barColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

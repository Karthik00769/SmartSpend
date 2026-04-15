'use client';

import { Card } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
} from 'recharts';

// Accepts both formats:
//   { label: string; spent: number }  — used by dashboard-summary (monthly trend)
//   { date: string;  total: number }  — used by analytics (daily breakdown)
type TrendPoint =
  | { label: string; spent: number }
  | { date: string;  total: number };

interface SpendingChartProps {
  data:     TrendPoint[];
  title?:   string;
  /** 'bar' renders a BarChart (default), 'line' renders a LineChart */
  variant?: 'bar' | 'line';
  /** Currency formatter — e.g. `fmt` from useSmartSpend(). Defaults to number with commas. */
  fmt?:     (amount: number) => string;
}

/** Normalize any TrendPoint to { name, value } so the chart is data-shape agnostic. */
function normalise(d: TrendPoint): { name: string; value: number } {
  const value = 'spent' in d ? d.spent : d.total;
  if ('label' in d) return { name: d.label, value: Number(value) };
  if ('date' in d) {
    // If the date is an ISO string "YYYY-MM-DD...", slice just the date part
    const dateStr = String(d.date).slice(0, 10);
    // Return "MM-DD" for readability
    return { name: dateStr.slice(5), value: Number(value) };
  }
  return { name: '', value: 0 };
}

// ── Hardcoded accent colors that are visible in both light and dark mode ───────
// CSS custom properties (oklch vars) do NOT resolve inside SVG presentation
// attributes. Using explicit hex/rgb is the only reliable approach for Recharts.
const ACCENT_COLOR  = '#6366f1'; // indigo-500 — visible on any background
const ACCENT_MUTED  = '#818cf8'; // indigo-400 — for dots
const GRID_COLOR    = '#374151'; // gray-700
const AXIS_COLOR    = '#9ca3af'; // gray-400
const TOOLTIP_BG    = 'var(--background, #1f2937)';
const TOOLTIP_BORDER = 'var(--border, #374151)';

export function SpendingChart({ data, title = 'Spending Trends', variant = 'bar', fmt }: SpendingChartProps) {
  // Default formatter: clean number with commas, no currency symbol
  const fmtValue = fmt ?? ((v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  // Normalize and guard
  let chartData: { name: string; value: number }[] = [];

  if (data && !Array.isArray(data) && 'labels' in data && 'values' in data) {
    // New format: { labels: [], values: [] }
    const labels = (data as any).labels as string[];
    const values = (data as any).values as number[];
    chartData = labels.map((l, i) => ({ name: l, value: values[i] || 0 }));
  } else if (Array.isArray(data)) {
    // Legacy array format
    chartData = data
      .map(normalise)
      .filter((d) => typeof d.value === 'number' && !isNaN(d.value));
  }

  if (chartData.length === 0) {
    return (
      <Card className="p-6 h-64 flex flex-col items-center justify-center border-dashed text-muted-foreground">
        <p className="text-2xl mb-2">📉</p>
        <p className="font-semibold">{title}</p>
        <p className="text-xs">No analysis available for this period</p>
      </Card>
    );
  }

  const commonProps = {
    data:   chartData,
    margin: { top: 10, right: 30, left: 10, bottom: 0 },
  };

  const xAxisProps = {
    dataKey:  'name',
    stroke:   AXIS_COLOR,
    fontSize: 10,
    fontWeight: 600,
    tickLine: false as const,
    axisLine: false as const,
    tick: { fill: AXIS_COLOR },
    interval: chartData.length > 15 ? Math.floor(chartData.length / 8) : 0,
  };

  const yAxisProps = {
    stroke:        AXIS_COLOR,
    fontSize:      10,
    fontWeight:    600,
    tickLine:      false as const,
    axisLine:      false as const,
    tick:          { fill: AXIS_COLOR },
    domain:        [0, 'auto'] as any, // auto dynamic scaling
    tickFormatter: (v: number) => fmtValue(v),
    width:         60,
    allowDecimals: false,
  };

  const tooltipProps = {
    contentStyle: {
      background:   '#1e1b4b', // Deep indigo background
      border:       `1px solid #4338ca`,
      borderRadius: '8px',
      color:        '#fff',
      fontSize:     '12px',
    },
    itemStyle: { color: '#818cf8', fontWeight: 700 }, // bright indigo
    labelStyle: { fontWeight: 700, marginBottom: '4px', color: '#fff' },
    formatter:    (value: number) => [fmtValue(value), 'Total Spent'],
  };

  return (
    <Card className="p-6 border-2 shadow-sm">
      <h3 className="text-lg font-extrabold text-foreground mb-6 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-primary rounded-full" />
        {title}
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {variant === 'line' ? (
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.2} vertical={false} />
              <XAxis {...xAxisProps} padding={{ left: 15, right: 15 }} />
              <YAxis {...yAxisProps} />
              <Tooltip {...tooltipProps} cursor={{ stroke: '#6366f1', strokeWidth: 1.5 }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={ACCENT_COLOR}
                strokeWidth={4}
                dot={{ r: 5, fill: '#fff', stroke: ACCENT_COLOR, strokeWidth: 2 }}
                activeDot={{ r: 7, strokeWidth: 0 }}
                connectNulls
                animationDuration={800}
              />
            </LineChart>
          ) : (
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.2} vertical={false} />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip {...tooltipProps} cursor={{ fill: '#6366f1', opacity: 0.1 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={800}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={index === chartData.length - 1 ? ACCENT_COLOR : '#a5b4fc'} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

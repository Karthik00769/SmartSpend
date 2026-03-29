'use client';

import { InsightDTO, InsightType } from '@/types/api';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface InsightCardProps {
  insight: InsightDTO;
  onMarkRead?: (id: number) => void;
}

const TYPE_CONFIG: Record<
  InsightType,
  { icon: string; bg: string; text: string; border: string; label: string }
> = {
  overspending_alert: {
    icon: '🚨',
    bg: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-800 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800/30',
    label: 'Overspending Alert',
  },
  budget_exceeded: {
    icon: '⚠️',
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/20',
    label: 'Budget Exceeded',
  },
  goal_at_risk: {
    icon: '🎯',
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    text: 'text-orange-800 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800/30',
    label: 'Goal at Risk',
  },
  savings_opportunity: {
    icon: '💡',
    bg: 'bg-green-50 dark:bg-green-950/20',
    text: 'text-green-800 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800/30',
    label: 'Savings Opportunity',
  },
  unusual_transaction: {
    icon: '🔍',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-800 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800/30',
    label: 'Unusual Activity',
  },
  monthly_summary: {
    icon: '📊',
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    text: 'text-purple-800 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800/30',
    label: 'Monthly Summary',
  },
};

export function InsightCard({ insight, onMarkRead }: InsightCardProps) {
  const config = TYPE_CONFIG[insight.type] || {
    icon: '📌',
    bg: 'bg-muted',
    text: 'text-foreground',
    border: 'border-border',
    label: 'Insight',
  };

  const formattedTime =
    insight.minutesAgo < 60
      ? `${insight.minutesAgo}m ago`
      : insight.minutesAgo < 1440
      ? `${Math.floor(insight.minutesAgo / 60)}h ago`
      : `${Math.floor(insight.minutesAgo / 1440)}d ago`;

  return (
    <Card
      className={cn(
        'p-4 border transition-all hover:shadow-md relative overflow-hidden',
        config.border,
        !insight.isRead ? 'border-l-4 border-l-primary' : ''
      )}
      onClick={() => !insight.isRead && onMarkRead?.(insight.id)}
    >
      <div className="flex gap-4 items-start">
        <div
          className={cn(
            'p-2.5 rounded-xl flex items-center justify-center text-2xl h-12 w-12 flex-shrink-0',
            config.bg
          )}
        >
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <span className={cn('text-xs font-semibold tracking-wide uppercase', config.text)}>
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">{formattedTime}</span>
          </div>
          
          <p className="text-foreground text-sm font-medium leading-relaxed">
            {insight.content}
          </p>

          {!insight.isRead && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
          )}
        </div>
      </div>
    </Card>
  );
}

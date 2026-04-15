import { DashboardStats } from '@/types';
import { Card } from '@/components/ui/card';

interface OverviewProps {
  stats: DashboardStats;
  /** Currency formatter — e.g. fmt from useSmartSpend(). */
  fmt?: (amount: number) => string;
}

export function FinancialOverview({ stats, fmt }: OverviewProps) {
  const format = fmt ?? ((n: number) => `$${n.toFixed(2)}`);

  const cards = [
    {
      title: 'Total Income',
      value: format(stats.totalIncome),
      icon: '💵',
      color: 'bg-green-50 dark:bg-green-950/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Total Expenses',
      value: format(stats.totalExpenses),
      icon: '💸',
      color: 'bg-red-50 dark:bg-red-950/30',
      textColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: 'Savings',
      value: format(stats.savings),
      icon: '🏦',
      color: 'bg-green-50 dark:bg-green-950/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Budget Remaining',
      value: format(stats.budgetRemaining),
      icon: '📊',
      color: 'bg-accent/10',
      textColor: 'text-accent',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card, idx) => (
        <Card key={idx} className={`${card.color} border-0 p-6`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{card.title}</p>
              <p className={`text-2xl font-bold ${card.textColor}`}>{card.value}</p>
            </div>
            <span className="text-3xl">{card.icon}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

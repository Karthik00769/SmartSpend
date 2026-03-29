import { DashboardStats } from '@/types';
import { Card } from '@/components/ui/card';

interface OverviewProps {
  stats: DashboardStats;
}

export function FinancialOverview({ stats }: OverviewProps) {
  const cards = [
    {
      title: 'Total Income',
      value: `$${stats.totalIncome.toFixed(2)}`,
      icon: '💵',
      color: 'bg-green-50 dark:bg-green-950/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Total Expenses',
      value: `$${stats.totalExpenses.toFixed(2)}`,
      icon: '💸',
      color: 'bg-red-50 dark:bg-red-950/30',
      textColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: 'Savings',
      value: `$${stats.savings.toFixed(2)}`,
      icon: '🏦',
      color: 'bg-green-50 dark:bg-green-950/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Budget Remaining',
      value: `$${stats.budgetRemaining.toFixed(2)}`,
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

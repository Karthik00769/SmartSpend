import { describe, it, expect, vi } from 'vitest';
import { getDashboardSummary } from '@/services/dashboard.service';
import * as dbModule from '@/lib/db';
import * as budgetService from '@/services/budget.service';
import * as goalService from '@/services/goal.service';
import * as insightService from '@/services/insight.service';

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}));

vi.mock('@/services/budget.service', () => ({
  listBudgets: vi.fn(),
}));

vi.mock('@/services/goal.service', () => ({
  listGoals: vi.fn(),
}));

vi.mock('@/services/insight.service', () => ({
  fetchInsights: vi.fn(),
}));

describe('Dashboard Service Aggregation', () => {
  it('aggregates dashboard data and applies FinanceCore math correctly', async () => {
    const userId = 'test-user';
    
    // Mock the DB query calls based on their sequence or signature.
    // In our service we have multiple Promise.all queries.
    // To simplify, we'll mock the implementation of `query` based on the sql string.
    vi.spyOn(dbModule, 'query').mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT monthly_income_paise')) {
        return [{ monthly_income_paise: '5000000' }]; // 50,000 INR
      }
      if (sql.includes('SELECT COALESCE(SUM(amount_paise), 0) AS total_spent FROM expenses')) {
        return [{ total_spent: '2000000' }]; // 20,000 INR
      }
      if (sql.includes('SELECT c.id AS category_id')) {
        return [{
          category_id: 1,
          category: 'Food',
          icon: '🍔',
          color: 'blue',
          total_spent: '1000000',
        }];
      }
      if (sql.includes('SELECT e.id, e.amount_paise, DATE_FORMAT')) {
        return [{
          id: 1,
          amount_paise: 50000,
          date: '2024-10-01',
          description: 'Lunch',
          category_id: 1,
          category_name: 'Food',
          category_icon: '🍔',
          source: 'manual',
          created_at: new Date(),
        }];
      }
      if (sql.includes('DATE_FORMAT(expense_date, \'%b\') AS month_label')) {
        return [
          { month_label: 'Sep', total_spent: '1500000' },
          { month_label: 'Oct', total_spent: '2000000' }
        ];
      }
      return []; // Default empty result
    });

    vi.spyOn(budgetService, 'listBudgets').mockResolvedValue({
      totalBudgetPaise: 3000000,
      totalSpentPaise: 1000000,
      categories: [
        {
          id: 1,
          categoryId: 1,
          category: 'Food',
          icon: '🍔',
          color: 'blue',
          allocatedPaise: 1500000,
          spentPaise: 1000000,
          usedPct: 66,
          isOverBudget: false,
          status: 'safe',
          needsAlert: false,
          remainingPaise: 500000,
          month: 10,
          year: 2024,
        }
      ]
    });

    vi.spyOn(goalService, 'listGoals').mockResolvedValue([]);
    vi.spyOn(insightService, 'fetchInsights').mockResolvedValue({ unreadCount: 0, insights: [] });

    const summary = await getDashboardSummary(userId);

    // Validate FinanceCore constraints and calculations
    expect(summary.totalSpentPaise).toBe(2000000);
    expect(summary.totalIncomePaise).toBe(5000000);
    expect(summary.savingsPaise).toBe(3000000); // 50000 - 20000
    
    // Savings rate = (3000000 / 5000000) * 100 = 60
    expect(summary.savingsRate).toBe(60);
    
    // Top category check
    expect(summary.topCategories.length).toBe(1);
    expect(summary.topCategories[0].category).toBe('Food');
    expect(summary.topCategories[0].spentPaise).toBe(1000000); // from db query
    
    // Recent expenses
    expect(summary.recentExpenses.length).toBe(1);
    expect(summary.recentExpenses[0].amountPaise).toBe(50000);

    // Health score
    expect(summary.healthScore).toBeGreaterThanOrEqual(0);
    expect(summary.healthScore).toBeLessThanOrEqual(100);
    expect(summary.healthStatus).toBeDefined();
  });
});

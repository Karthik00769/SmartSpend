import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { ok, fail } from '@/lib/api-response';
import { getDashboardSummary } from '@/services/dashboard.service';
import { Math as FinanceMath, Analytics } from '@/lib/finance';
import { daysInMonthIST } from '@/lib/time/time.service';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  try {
    const { searchParams } = new URL(req.url);
    const userId = (session.user as any).id as string;
    
    // Use the central dashboard summary service for single source of truth
    const summary = await getDashboardSummary(userId);

    const totalIncome  = FinanceMath.minorToInr(summary.totalIncomeMinor);
    const totalSpent   = FinanceMath.minorToInr(summary.totalSpentMinor);
    const savings      = FinanceMath.minorToInr(summary.savingsMinor);
    const totalBudget  = FinanceMath.minorToInr(summary.totalBudgetMinor);
    const budgetRemaining = FinanceMath.minorToInr(summary.budgetRemainingMinor);

    const now = new Date();

    return ok({
      stats: {
        totalIncome,
        totalExpenses:   totalSpent,
        savings,
        budgetRemaining,
        currentMonth:    new Date(now.getFullYear(), now.getMonth(), 1).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
        totalTransactions: 0, // Not provided directly in DashboardSummaryDTO, frontend usually ignores this
        dailyAvgSpend:   FinanceMath.minorToInr(summary.dailyAvgSpendMinor),
        incomeSpentPct:  summary.incomeSpentPct,
      },
      chartData: summary.topCategories.map(c => ({
        name:       c.category,
        value:      FinanceMath.minorToInr(c.spentMinor),
        percentage: c.usedPct ?? 0,
        color:      c.color || '#6B7280',
        icon:       c.icon || '📌',
      })),
      budgetCategories: summary.topCategories.map(c => ({
        category:    c.category,
        icon:        c.icon || '📌',
        allocated:   FinanceMath.minorToInr(c.allocatedMinor),
        spent:       FinanceMath.minorToInr(c.spentMinor),
        usedPct:     c.usedPct,
        isOverBudget: c.isOverBudget,
        status:      c.status,
        needsAlert:  c.needsAlert,
        remaining:   FinanceMath.minorToInr(c.remainingMinor),
        month:       c.month,
        year:        c.year,
      })),
    });
  } catch (err) {
    console.error('[GET /api/dashboard]', err);
    return fail('Failed to load dashboard data.', 500);
  }
}

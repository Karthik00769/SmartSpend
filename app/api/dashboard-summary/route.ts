/**
 * app/api/dashboard-summary/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET /api/dashboard-summary
 * Returns: total spending, savings rate, budget progress, recent insights, health score
 *
 * All responses use the { ok, data } / { ok, error } envelope.
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { query } from '@/lib/db';
import { listBudgets } from '@/services/budget.service';
import { listGoals } from '@/services/goal.service';
import { fetchInsights } from '@/services/insight.service';
import { monthlyExpenseSummary, getMonthlyTrends, categoryWiseTotals } from '@/services/expense.service';
import { calculateHealthScore } from '@/lib/analytics/healthScore';
import { generateInsights, UserFinancialData } from '@/lib/ai/insightGenerator';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  try {
    const userRows = await query<{ monthly_income: string }[]>(
      `SELECT monthly_income FROM users WHERE id = ?`,
      [userId]
    );

    const monthlyIncome = parseFloat(userRows[0]?.monthly_income ?? '0');

    const [summary, budgets, goals, insightsBundle, trendRows] = await Promise.all([
      monthlyExpenseSummary(userId, currentYear, currentMonth),
      listBudgets({ userId, month: currentMonth, year: currentYear }),
      listGoals({ userId, status: 'active' }),
      fetchInsights({ userId, unreadOnly: false }),
      getMonthlyTrends(userId, 6)
    ]);

    const totalSpent = summary.totalSpent;
    const savingsRate = monthlyIncome > 0 
      ? Math.max(0, Math.round(((monthlyIncome - totalSpent) / monthlyIncome) * 100))
      : 0;

    const healthData = calculateHealthScore({
      monthlyIncome,
      totalSpent,
      budgets,
      goals
    });

    // If no insights exist for this month, generate them now (non-blocking on failure)
    let finalInsights = insightsBundle.insights;
    const hasThisMonth = finalInsights.some(
      i => i.month === currentMonth && i.year === currentYear
    );

    if (!hasThisMonth && summary.totalSpent > 0) {
      try {
        const categories = await categoryWiseTotals(userId, currentYear, currentMonth);
        const catDist = categories.reduce((acc: Record<string, number>, c) => {
          acc[c.name] = c.total;
          return acc;
        }, {});

        const aiData: UserFinancialData = {
          monthlySpending: summary.totalSpent,
          categoryDistribution: catDist,
          budgetUsage: budgets.categories.map(b => ({ category: b.category, limit: b.allocated, spent: b.spent })),
          goalProgress: goals.map(g => ({ title: g.title, target: g.targetAmount, current: g.currentAmount })),
        };

        const typeMap: Record<string, string> = {
          warning:     'overspending_alert',
          opportunity: 'savings_opportunity',
          trend:       'monthly_summary',
        };

        const newInsights = await generateInsights(aiData);
        for (const insight of newInsights) {
          const dbType = typeMap[insight.type] ?? 'monthly_summary';
          await query(
            `INSERT IGNORE INTO insights (user_id, insight_type, content, message, metadata, generated_for_month, generated_for_year)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, dbType, insight.message, insight.message, JSON.stringify({ aiGenerated: true }), currentMonth, currentYear]
          );
        }

        if (newInsights.length > 0) {
          const refreshed = await fetchInsights({ userId, unreadOnly: false });
          finalInsights = refreshed.insights;
        }
      } catch (genErr) {
        // Insight generation failure must never crash the dashboard
        console.warn('[dashboard-summary] Insight generation failed (non-fatal):', genErr);
      }
    }

    const recentInsights = finalInsights.slice(0, 5);

    return ok({
      totalSpending: totalSpent,
      savingsRate,
      budgetProgress: budgets.categories.map((b) => ({
        category: b.category,
        allocated: b.allocated,
        spent: b.spent,
        remaining: b.remaining,
        isOverBudget: b.isOverBudget,
        usedPct: b.usedPct
      })),
      recentInsights,
      monthlyTrend: trendRows.map(r => ({ label: r.month_label, spent: parseFloat(r.total_spent) })),
      financialHealthScore: {
        score: healthData.score,
        status: healthData.status
      }
    });

  } catch (error) {
    console.error('[GET /api/dashboard-summary]', error);
    return fail('Failed to fetch dashboard summary.', 500);
  }
}

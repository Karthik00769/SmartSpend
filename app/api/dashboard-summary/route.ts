/**
 * app/api/dashboard-summary/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET /api/dashboard-summary
 *
 * Returns: total spending, savings rate, budget progress,
 *          recent insights (always non-empty if expenses exist),
 *          monthly trend, and financial health score.
 *
 * All data is scoped to the authenticated session user.
 * Insight generation never crashes the request — failures fall back
 * to rule-based insights generated from DB data.
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { query } from '@/lib/db';
import { listBudgets } from '@/services/budget.service';
import { listGoals } from '@/services/goal.service';
import { fetchInsights } from '@/services/insight.service';
import {
  monthlyExpenseSummary,
  getMonthlyTrends,
  categoryWiseTotals,
} from '@/services/expense.service';
import { calculateHealthScore } from '@/lib/analytics/healthScore';
import { generateInsights, type UserFinancialData } from '@/lib/ai/insightGenerator';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  try {
    // ── 1. User income ────────────────────────────────────────────────────────
    const userRows = await query<{ monthly_income: string }[]>(
      `SELECT monthly_income FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const monthlyIncome = parseFloat(userRows[0]?.monthly_income ?? '0');

    // ── 2. Parallel data fetch ────────────────────────────────────────────────
    const [summary, budgets, goals, insightsBundle, trendRows] = await Promise.all([
      monthlyExpenseSummary(userId, currentYear, currentMonth),
      listBudgets({ userId, month: currentMonth, year: currentYear }),
      listGoals({ userId, status: 'active' }),
      fetchInsights({ userId, unreadOnly: false }),
      getMonthlyTrends(userId, 6),
    ]);

    const totalSpent  = summary.totalSpent;
    const savingsRate = monthlyIncome > 0
      ? Math.max(0, Math.round(((monthlyIncome - totalSpent) / monthlyIncome) * 100))
      : 0;

    const healthData = calculateHealthScore({ monthlyIncome, totalSpent, budgets, goals });

    const trendLabels = trendRows.map(r => r.month_label);
    const trendValues = trendRows.map(r => parseFloat(r.total_spent));

    // ── 3. Insight generation (with guaranteed fallback) ──────────────────────
    let finalInsights = insightsBundle.insights;
    const hasThisMonth = finalInsights.some(
      i => i.month === currentMonth && i.year === currentYear,
    );

    // Generate if no insights exist for this month
    if (!hasThisMonth) {
      try {
        const categories = await categoryWiseTotals(userId, currentYear, currentMonth);
        const catDist = categories.reduce<Record<string, number>>((acc, c) => {
          acc[c.name] = c.total;
          return acc;
        }, {});

        // Get last month's spend for comparison
        const lastMonthSpend = trendValues.length >= 2 ? trendValues[trendValues.length - 2] : 0;
        const changePercent = lastMonthSpend > 0
          ? Math.round(((totalSpent - lastMonthSpend) / lastMonthSpend) * 100)
          : 0;

        const aiData: UserFinancialData = {
          monthlySpending:      totalSpent,
          categoryDistribution: catDist,
          budgetUsage:   budgets.categories.map(b => ({ category: b.category, limit: b.allocated, spent: b.spent })),
          goalProgress:  goals.map(g => ({ title: g.title, target: g.targetAmount, current: g.savedAmount })),
          monthlyIncome,
          savings: Math.max(0, monthlyIncome - totalSpent),
          savingsRate,
          comparison: {
            lastMonthSpend,
            changePercent,
          }
        };

        // RULE-BASED ONLY: Remove fake data, bypass AI generator

        const newInsights = [];
        if (totalSpent > (monthlyIncome * 0.8)) {
          newInsights.push({ type: 'warning', message: 'You have spent over 80% of your income this month.', content: 'High spending detected based on your monthly income.' });
        }
        if (savingsRate > 20) {
          newInsights.push({ type: 'opportunity', message: 'Great job saving! You have saved over 20% this month.', content: 'Consider investing your surplus savings.' });
        }
        
        for (const b of budgets.categories) {
           if (b.isOverBudget) {
              newInsights.push({ type: 'warning', message: `You are over budget on ${b.category}`, content: `You exceeded your budget of $${b.allocated} for ${b.category}.` });
           }
        }

        const typeMap: Record<string, string> = {
          warning:     'overspending_alert',
          opportunity: 'savings_opportunity',
          trend:       'monthly_summary',
        };

        for (const insight of newInsights) {
          const dbType = typeMap[insight.type] ?? 'monthly_summary';
          await query(
            `INSERT IGNORE INTO insights
               (user_id, insight_type, content, metadata, generated_for_month, generated_for_year)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, dbType, insight.content, JSON.stringify({ source: 'rule_based' }), currentMonth, currentYear],
          );
        }

        if (newInsights.length > 0) {
          const refreshed = await fetchInsights({ userId, unreadOnly: false });
          finalInsights = refreshed.insights;
        }
      } catch (genErr) {
        // Insight generation / DB write failure must never crash the dashboard
        console.warn('[dashboard-summary] Insight generation failed (non-fatal):', genErr);
      }
    }

    return ok({
      totalSpending: totalSpent,
      savingsRate,
      budgetProgress: budgets.categories.map(b => ({
        category:    b.category,
        allocated:   b.allocated,
        spent:       b.spent,
        remaining:   b.remaining,
        isOverBudget: b.isOverBudget,
        usedPct:     b.usedPct,
      })),
      recentInsights: finalInsights.slice(0, 5),
      monthlyTrend: trendLabels.map((l, i) => ({
        label: l,
        spent: trendValues[i],
      })),
      financialHealthScore: {
        score:  healthData.score,
        status: healthData.status,
      },
    });
  } catch (error) {
    console.error('[GET /api/dashboard-summary]', error);
    return fail('Failed to fetch dashboard summary.', 500);
  }
}

/**
 * app/api/insights/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET   /api/insights          — fetch insights (notification panel)
 * PATCH /api/insights          — mark all insights as read
 * POST  /api/insights/generate — trigger the rules engine (cron-safe)
 *
 * Example calls:
 *
 *   GET /api/insights?userId=1
 *   GET /api/insights?userId=1&unreadOnly=true
 *
 *   PATCH /api/insights
 *   { "userId": "1" }
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import {
  parseBody,
  parseQuery,
  GetInsightsQuerySchema,
  MarkInsightsReadSchema,
} from '@/lib/validate';
import { fetchInsights, markAllRead } from '@/services/insight.service';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";

import { monthlyExpenseSummary, categoryWiseTotals } from '@/services/expense.service';
import { listBudgets } from '@/services/budget.service';
import { listGoals } from '@/services/goal.service';
import { generateInsights, UserFinancialData } from '@/lib/ai/insightGenerator';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = parseQuery(req.nextUrl.searchParams, GetInsightsQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const queryData = parsed.data as any;
    queryData.userId = (session.user as any).id;
    let result = await fetchInsights(queryData);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const hasCurrentMonthInsights = result.insights.some(i => i.month === currentMonth && i.year === currentYear);

    if (!hasCurrentMonthInsights) {
      const [summary, categories, budgets, goals] = await Promise.all([
        monthlyExpenseSummary(queryData.userId, currentYear, currentMonth),
        categoryWiseTotals(queryData.userId, currentYear, currentMonth),
        listBudgets({ userId: queryData.userId, month: currentMonth, year: currentYear } as any),
        listGoals({ userId: queryData.userId, status: 'active' } as any)
      ]);

      const catDist = categories.reduce((acc: any, c) => ({ ...acc, [c.name]: c.total }), {});

      const aiData: UserFinancialData = {
        monthlySpending: summary.totalSpent,
        categoryDistribution: catDist,
        budgetUsage: budgets.categories.map((b: any) => ({ category: b.category, limit: b.allocated, spent: b.spent })),
        goalProgress: goals.map(g => ({ title: g.title, target: g.targetAmount, current: g.currentAmount }))
      };

      const newInsights = await generateInsights(aiData);

      if (newInsights.length > 0) {
        // Map AI-generated type strings to valid DB ENUM values
        const typeMap: Record<string, string> = {
          warning:     'overspending_alert',
          opportunity: 'savings_opportunity',
          trend:       'monthly_summary',
        };

        for (const insight of newInsights) {
          const dbType = typeMap[insight.type] ?? 'monthly_summary';
          await query(
            'INSERT IGNORE INTO insights (user_id, insight_type, content, metadata, generated_for_month, generated_for_year) VALUES (?, ?, ?, ?, ?, ?)',
            [queryData.userId, dbType, insight.message, JSON.stringify({ aiGenerated: true }), currentMonth, currentYear]
          );
        }
        // Refetch to include newly generated insights securely scoped to user
        result = await fetchInsights(queryData);
      }
    }

    return ok(result);
  } catch (err) {
    console.error('[GET /api/insights]', err);
    return fail('Failed to fetch insights.', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = await parseBody(req, MarkInsightsReadSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const updatedCount = await markAllRead((session.user as any).id as string);
    return ok({ markedRead: updatedCount });

  } catch (err) {
    console.error('[PATCH /api/insights]', err);
    return fail('Failed to mark insights as read.', 500);
  }
}

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
import { query } from '@/lib/db';
import { Analytics } from '@/lib/finance';

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

      const totalSpent  = summary.totalSpent;
      const topCat      = categories[0];

      // Rule-based insights derived entirely from DB data — no AI hallucination
      const newInsights: { type: string; content: string }[] = [];

      // 1. Top spending category
      if (topCat && totalSpent > 0) {
        const pct = Math.round(Analytics.calculateCategoryPct(topCat.total, totalSpent));
        newInsights.push({
          type:    'monthly_summary',
          content: `Your top spending category this month is ${topCat.name} at ${topCat.total.toFixed(2)} (${pct}% of total spend).`,
        });
      }

      // 2. Budget exceeded
      for (const b of budgets.categories.filter(b => b.isOverBudget).slice(0, 2)) {
        newInsights.push({
          type:    'budget_exceeded',
          content: `You've exceeded your ${b.category} budget by ${Math.abs(b.remainingPaise / 100).toFixed(2)} (${(b.spentPaise / 100).toFixed(2)} spent vs ${(b.allocatedPaise / 100).toFixed(2)} limit).`,
        });
      }

      // 3. Budget near limit (80–99%)
      for (const b of budgets.categories.filter(b => !b.isOverBudget && (b.usedPct ?? 0) >= 80).slice(0, 1)) {
        newInsights.push({
          type:    'overspending_alert',
          content: `You're at ${b.usedPct?.toFixed(0)}% of your ${b.category} budget — ${(b.remainingPaise / 100).toFixed(2)} remaining.`,
        });
      }

      // 4. Goal progress
      for (const g of goals.slice(0, 1)) {
        const pct = g.progressPct;
        newInsights.push({
          type:    pct >= 75 ? 'savings_opportunity' : 'goal_at_risk',
          content: `Your "${g.title}" goal is ${pct}% complete (${(g.savedAmountPaise / 100).toFixed(2)} of ${(g.targetAmountPaise / 100).toFixed(2)} saved).`,
        });
      }

      if (newInsights.length > 0) {
        for (const insight of newInsights) {
          await query(
            `INSERT INTO insights
               (user_id, insight_type, content, metadata, generated_for_month, generated_for_year, created_at, is_read)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), 0)
             ON DUPLICATE KEY UPDATE
               content = VALUES(content),
               metadata = VALUES(metadata),
               is_read = 0,
               created_at = NOW()`,
            [queryData.userId, insight.type, insight.content, JSON.stringify({ source: 'rule_based' }), currentMonth, currentYear],
          );
        }
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

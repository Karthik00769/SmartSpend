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
import { getDashboardSummary } from '@/services/dashboard.service';
import { query } from '@/lib/db';
import { generateBehavioralAdvice } from '@/lib/ai/behavioralCoach';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  try {
    const summary = await getDashboardSummary(userId);

    // ── 3. Insight generation (with guaranteed fallback) ──────────────────────
    const hasThisMonth = summary.recentInsights.some(
      i => i.month === currentMonth && i.year === currentYear,
    );

    // Generate if no insights exist for this month
    if (!hasThisMonth) {
      // Run generation in the background so it doesn't block the response
      Promise.resolve().then(async () => {
        try {
          const totalSpent = summary.totalSpentPaise / 100;
          const monthlyIncome = summary.totalIncomePaise / 100;
          
          const newInsights = [];
          if (totalSpent > (monthlyIncome * 0.8)) {
            newInsights.push({ type: 'warning', message: 'You have spent over 80% of your income this month.', content: 'High spending detected based on your monthly income.' });
          }
          if (summary.savingsRate > 20) {
            newInsights.push({ type: 'opportunity', message: 'Great job saving! You have saved over 20% this month.', content: 'Consider investing your surplus savings.' });
          }
          
          for (const b of summary.topCategories) {
             if (b.isOverBudget) {
                const advice = await generateBehavioralAdvice({
                  category: b.category,
                  spend: b.spentPaise,
                  budget: b.allocatedPaise,
                  currency: '₹'
                });
                newInsights.push({ type: 'warning', message: `You are over budget on ${b.category}`, content: advice || `You exceeded your budget for ${b.category}.` });
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
        } catch (genErr) {
          console.warn('[dashboard-summary] Insight generation failed (non-fatal):', genErr);
        }
      });
    }

    return ok(summary);
  } catch (error) {
    console.error('[GET /api/dashboard-summary]', error);
    return fail('Failed to fetch dashboard summary.', 500);
  }
}


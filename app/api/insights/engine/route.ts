/**
 * app/api/insights/engine/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET /api/insights/engine?userId=1&year=2026&month=3
 *
 * Runs the full Insights Engine pipeline and returns a complete
 * InsightsEngineOutput JSON payload.
 *
 * Response includes:
 *  - weekOverWeek   : % change vs last week per category
 *  - monthOverMonth : full MoM deltas (spend, savings, categories)
 *  - goalProbabilities : probability + milestones per active goal
 *  - advice         : sorted TextAdvice[] with headlines + CTAs
 *  - pattern        : spending behaviour detection
 *  - score          : overall + 4 sub-scores financial health
 *
 * Example:
 *   GET /api/insights/engine?userId=1
 *   GET /api/insights/engine?userId=1&year=2026&month=3
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail } from '@/lib/api-response';
import { parseQuery } from '@/lib/validate';
import { runInsightsEngine } from '@/lib/insights-engine';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";

const EngineQuerySchema = z.object({
  year:   z.coerce.number().int().min(2000).max(2100).optional(),
  month:  z.coerce.number().int().min(1).max(12).optional(),
  months: z.coerce.number().int().min(1).max(6).default(3),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const parsed = parseQuery(req.nextUrl.searchParams, EngineQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  const now   = new Date();
  const { year = now.getFullYear(), month = now.getMonth() + 1, months = 3 } = parsed.data;

  try {
    const output = await runInsightsEngine(userId as string, year, month, months);

    // ── Gemini AI layer (Step 7 polish) ──────────────────────────────────────
    // Only call if API key is configured — gracefully skip if not
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && output.savingsAnalysis.income > 0) {
      try {
        const { topCategories, categoryTrends, anomalies, savingsAnalysis } = output;

        const prompt = [
          `Analyze this user's spending behavior and suggest realistic improvements.`,
          `Do not force decisions. Give 2-3 optional, actionable suggestions.`,
          `Be concise (max 120 words). Use plain language, no markdown.`,
          ``,
          `Income: ${savingsAnalysis.income}`,
          `Total spent: ${savingsAnalysis.totalSpent}`,
          `Savings rate: ${savingsAnalysis.savingsRate}% (${savingsAnalysis.classification})`,
          ``,
          `Top categories: ${topCategories.map(c => `${c.categoryName} ${c.percentageOfTotal}%`).join(', ')}`,
          ``,
          `Trends: ${categoryTrends.slice(0, 5).map(t => `${t.categoryName} ${t.trend} (${t.trendPct}%)`).join(', ')}`,
          ``,
          anomalies.length > 0
            ? `Anomalies: ${anomalies.map(a => a.message).join('; ')}`
            : `No spending anomalies detected.`,
        ].join('\n');

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
            }),
            signal: AbortSignal.timeout(8000),
          }
        );

        if (geminiRes.ok) {
          const geminiJson = await geminiRes.json();
          const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
          if (text) output.aiSuggestions = text.trim();
        }
      } catch (aiErr) {
        // Non-fatal — insights still work without AI
        console.warn('[insights/engine] Gemini call failed (non-fatal):', (aiErr as any)?.message);
      }
    }

    return ok(output);

  } catch (err) {
    console.error('[GET /api/insights/engine]', err);
    return fail('Insights engine failed. Check database connection.', 500);
  }
}

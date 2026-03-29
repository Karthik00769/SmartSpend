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
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const parsed = parseQuery(req.nextUrl.searchParams, EngineQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  const now   = new Date();
  const { year = now.getFullYear(), month = now.getMonth() + 1 } = parsed.data;

  try {
    const output = await runInsightsEngine(userId as string, year, month);
    return ok(output);

  } catch (err) {
    console.error('[GET /api/insights/engine]', err);
    return fail('Insights engine failed. Check database connection.', 500);
  }
}

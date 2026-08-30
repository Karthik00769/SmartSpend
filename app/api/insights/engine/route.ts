import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail } from '@/lib/api-response';
import { parseQuery } from '@/lib/validate';
import { runInsightsEngine } from '@/lib/insights-engine';
import { buildInsightContext } from '@/services/insights.service';
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
    // 1. Build the deterministic context (all math runs here in FinanceCore layer)
    const context = await buildInsightContext(userId, year, month, months);

    // 2. Orchestrate text generation and formatting
    const output = await runInsightsEngine(context);

    return ok(output);

  } catch (err) {
    console.error('[GET /api/insights/engine]', err);
    return fail('Insights engine failed. Check database connection.', 500);
  }
}

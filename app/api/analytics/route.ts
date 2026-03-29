/**
 * app/api/analytics/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET /api/analytics?userId=1&year=2026&month=3
 *
 * Returns the full SummaryBundle: monthly KPIs, weekly breakdown,
 * category totals, and pre-formatted Recharts chart data.
 *
 * This is the single endpoint the dashboard, reports, and insights
 * pages should call — one request, zero waterfalls.
 *
 * Example:
 *   GET /api/analytics?userId=1
 *   GET /api/analytics?userId=1&year=2026&month=3
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { parseQuery } from '@/lib/validate';
import { z } from 'zod';
import { query } from '@/lib/db';
import { generateSummaries } from '@/lib/expense-engine';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';

// ── Query schema ──────────────────────────────────────────────────────────────

const AnalyticsQuerySchema = z.object({
  year:   z.coerce.number().int().min(2000).max(2100).optional(),
  month:  z.coerce.number().int().min(1).max(12).optional(),
});

interface UserRow { monthly_income: string }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const parsed = parseQuery(req.nextUrl.searchParams, AnalyticsQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  const now   = new Date();
  const { year = now.getFullYear(), month = now.getMonth() + 1 } = parsed.data;

  try {
    // Fetch user income (needed for savings calculations in the engine)
    const [userRow] = await query<UserRow[]>(
      `SELECT monthly_income FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const monthlyIncome = parseFloat(userRow?.monthly_income ?? '0');

    // Run the full engine pipeline
    const bundle = await generateSummaries(userId as string, year, month, monthlyIncome);


    return ok({
      period: {
        year,
        month,
        label: bundle.monthly.label,
      },
      summary:    bundle.monthly,
      weekly:     bundle.weekly,
      categories: bundle.categories,
      charts:     bundle.charts,
    });
  } catch (err) {
    console.error('[GET /api/analytics]', err);
    return fail('Failed to generate analytics. Check database connection.', 500);
  }
}

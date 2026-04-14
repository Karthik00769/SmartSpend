/**
 * app/api/analytics/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET /api/analytics?year=2026&month=3
 *
 * Returns the full analytics bundle:
 *  - summary    : monthly KPIs (total spend, savings rate, etc.)
 *  - weekly     : per-week breakdown
 *  - categories : category totals with pie/bar data
 *  - charts     : pre-formatted Recharts data arrays
 *  - daily      : date-wise grouped expenses [{ date, total }, ...]
 *
 * All data is isolated to the authenticated session user.
 * Handles the case where the user has zero expenses gracefully.
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
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

interface UserRow { monthly_income: string }
interface DailyRow { date: string; total: string }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const parsed = parseQuery(req.nextUrl.searchParams, AnalyticsQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  const now = new Date();
  const { year = now.getFullYear(), month = now.getMonth() + 1 } = parsed.data;

  try {
    // ── 1. Fetch user's monthly income ────────────────────────────────────────
    const [userRow] = await query<UserRow[]>(
      `SELECT monthly_income FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const monthlyIncome = parseFloat(userRow?.monthly_income ?? '0');

    // ── 2. Full engine bundle (summary, weekly, categories, chart data) ───────
    const bundle = await generateSummaries(userId, year, month, monthlyIncome);

    // ── 3. Date-wise daily totals for the selected month ──────────────────────
    // Produces: [{ date: "2026-03-01", total: 120.50 }, ...]
    // Used by the spending trend line/bar chart on the analytics page.
    // ── 3. Date-wise daily totals for the full spending history ────────────────
    // [RULE] Fix SQL to allow historical trend rendering
    const dailyRows = await query<DailyRow[]>(
      `SELECT 
         DATE_FORMAT(expense_date, '%Y-%m-%d') AS date, 
         SUM(amount) AS total
       FROM expenses
       WHERE user_id = ? AND deleted_at IS NULL
       GROUP BY DATE_FORMAT(expense_date, '%Y-%m-%d')
       ORDER BY date ASC`,
      [userId],
    );

    // Normalise to standard labels/values format for the chart component
    const daily = {
      labels: dailyRows.map(r => String(r.date ?? '').slice(5, 10)), // MM-DD for cleaner axis
      values: dailyRows.map(r => parseFloat(r.total ?? '0')),
    };

    return ok({
      period: {
        year,
        month,
        label: bundle.monthly.label,
      },
      summary: bundle.monthly,
      weekly: bundle.weekly,
      categories: bundle.categories,
      charts: bundle.charts,
      daily,
    });
  } catch (err) {
    console.error('[GET /api/analytics]', err);
    return fail('Failed to generate analytics. Check database connection.', 500);
  }
}

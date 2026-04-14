/**
 * app/api/settings/export/route.ts
 * GET /api/settings/export?format=json|csv
 *
 * Exports all user data: profile, expenses, budgets, goals, insights.
 * Scoped strictly to the authenticated user. No external dependencies.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import { query }                     from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const format = req.nextUrl.searchParams.get('format') ?? 'json';

  try {
    // Fetch all user data in parallel — strictly user_id scoped
    const [profile, expenses, budgets, goals, insights] = await Promise.all([
      query<any[]>(
        `SELECT id, full_name AS name, email, monthly_income, currency_code AS currency, created_at
         FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [userId],
      ),
      query<any[]>(
        `SELECT e.id, e.amount, e.description, e.expense_date AS date,
                c.name AS category, e.source, e.created_at
         FROM expenses e
         LEFT JOIN categories c ON e.category_id = c.id
         WHERE e.user_id = ? AND e.deleted_at IS NULL
         ORDER BY e.expense_date DESC`,
        [userId],
      ),
      query<any[]>(
        `SELECT b.id, c.name AS category, b.limit_amount, b.month, b.year, b.created_at
         FROM budgets b
         LEFT JOIN categories c ON b.category_id = c.id
         WHERE b.user_id = ? AND b.deleted_at IS NULL
         ORDER BY b.year DESC, b.month DESC`,
        [userId],
      ),
      query<any[]>(
        `SELECT id, title, description, target_amount, saved_amount,
                target_date AS deadline, priority, status, created_at
         FROM goals WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [userId],
      ),
      query<any[]>(
        `SELECT id, insight_type AS type, content,
                generated_for_month AS month, generated_for_year AS year, created_at
         FROM insights WHERE user_id = ?
         ORDER BY created_at DESC LIMIT 100`,
        [userId],
      ),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile:    profile[0] ?? null,
      expenses,
      budgets,
      goals,
      insights,
    };

    if (format === 'csv') {
      // Flatten expenses as the primary CSV export (most useful for users)
      const rows = exportData.expenses;
      if (rows.length === 0) {
        return new NextResponse('No expenses to export.', {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      const headers = Object.keys(rows[0]).join(',');
      const lines   = rows.map(r =>
        Object.values(r).map(v =>
          v == null ? '' : `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      );
      const csv = [headers, ...lines].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type':        'text/csv',
          'Content-Disposition': `attachment; filename="smartspend-expenses-${userId}.csv"`,
        },
      });
    }

    // Default: JSON
    const json = JSON.stringify(exportData, null, 2);
    return new NextResponse(json, {
      headers: {
        'Content-Type':        'application/json',
        'Content-Disposition': `attachment; filename="smartspend-export-${userId}.json"`,
      },
    });

  } catch (err) {
    console.error('[GET /api/settings/export]', err);
    return NextResponse.json({ ok: false, error: 'Export failed.' }, { status: 500 });
  }
}

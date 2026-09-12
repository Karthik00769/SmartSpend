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
        `SELECT id, full_name AS name, email, monthly_income_minor AS monthly_income_minor, currency_code AS currency, created_at
         FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [userId],
      ),
      query<any[]>(
        `SELECT e.id, e.amount_minor AS amount_minor, e.description, e.expense_date AS date,
                c.name AS category, e.source, e.merchant, e.created_at
         FROM expenses e
         LEFT JOIN categories c ON e.category_id = c.id
         WHERE e.user_id = ? AND e.deleted_at IS NULL
         ORDER BY e.expense_date DESC`,
        [userId],
      ),
      query<any[]>(
        `SELECT b.id, c.name AS category, b.limit_minor AS limit_minor, b.month, b.year, b.created_at
         FROM budgets b
         LEFT JOIN categories c ON b.category_id = c.id
         WHERE b.user_id = ? AND b.deleted_at IS NULL
         ORDER BY b.year DESC, b.month DESC`,
        [userId],
      ),
      query<any[]>(
        `SELECT id, title, description, target_minor AS target_minor, saved_minor AS saved_minor,
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

    const totalIncome = parseInt(profile[0]?.monthly_income_minor || '0', 10);
    const totalExpenses = expenses.reduce((acc: number, e: any) => acc + parseInt(e.amount_minor || '0', 10), 0);
    
    const exportData = {
      exportDate:  new Date().toISOString(),
      userProfile: profile[0] ?? null,
      summary: {
        totalIncomeMinor: totalIncome,
        totalExpensesMinor: totalExpenses,
        currency: profile[0]?.currency || 'USD'
      },
      expenses,
      budgets,
      goals
    };

    if (format === 'csv') {
      const rows = exportData.expenses;
      if (rows.length === 0) {
        return new NextResponse('No expenses to export.', {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      
      const currency = profile[0]?.currency || 'USD';
      
      const headers = ['Date', 'Category', 'Merchant', 'Description', 'Amount', 'Currency'].join(',');
      const lines = rows.map((r: any) => {
        const date = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
        const category = r.category || 'Uncategorized';
        // Note: the original query doesn't select merchant yet. Wait, I should ensure it does, but for now I'll parse it from description or add merchant field if available
        const merchant = r.merchant || '';
        const desc = r.description || '';
        const amt = r.amount_minor ? (parseInt(r.amount_minor, 10) / 100).toFixed(2) : '0.00';
        
        return [
          `"${date}"`,
          `"${category.replace(/"/g, '""')}"`,
          `"${merchant.replace(/"/g, '""')}"`,
          `"${desc.replace(/"/g, '""')}"`,
          `"${amt}"`,
          `"${currency}"`
        ].join(',');
      });
      
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

/**
 * app/api/settings/export/route.ts
 * GET /api/settings/export?format=json|csv
 *
 * Exports all user data: profile, expenses, budgets, goals, insights.
 * - Scoped strictly to the authenticated user
 * - All timestamps displayed in IST (Asia/Kolkata)
 * - Complete data export for GDPR compliance (data portability)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import { query }                     from '@/lib/db';
import { formatDateIST, formatIST } from '@/lib/time/time.service';
import { Math as FinanceMath } from '@/lib/finance';

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
                c.name AS category, e.source, e.merchant, e.payment_method, e.notes, e.receipt_url,
                e.created_at, e.updated_at
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
      exportDate: formatIST(new Date(), 'datetime'),
      exportDateUTC: new Date().toISOString(),
      timezone: 'Asia/Kolkata (IST, UTC+05:30)',
      userProfile: profile[0] ? {
        ...profile[0],
        created_at: profile[0].created_at ? formatIST(new Date(profile[0].created_at), 'datetime') : null,
      } : null,
      summary: {
        totalIncomeMinor: totalIncome,
        totalExpensesMinor: totalExpenses,
        currency: profile[0]?.currency || 'USD'
      },
      expenses: expenses.map((e: any) => ({
        ...e,
        date: e.date ? formatDateIST(new Date(e.date)) : null,
        created_at: e.created_at ? formatIST(new Date(e.created_at), 'datetime') : null,
        updated_at: e.updated_at ? formatIST(new Date(e.updated_at), 'datetime') : null,
      })),
      budgets: budgets.map((b: any) => ({
        ...b,
        created_at: b.created_at ? formatIST(new Date(b.created_at), 'datetime') : null,
      })),
      goals: goals.map((g: any) => ({
        ...g,
        deadline: g.deadline ? formatDateIST(new Date(g.deadline)) : null,
        created_at: g.created_at ? formatIST(new Date(g.created_at), 'datetime') : null,
      })),
      insights
    };

    if (format === 'csv') {
      const rows = exportData.expenses;
      if (rows.length === 0) {
        return new NextResponse('No expenses to export.', {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      
      const currency = profile[0]?.currency || 'USD';
      
      const headers = [
        'Date',
        'Category',
        'Merchant',
        'Description',
        'Amount',
        'Currency',
        'Payment Method',
        'Source',
        'Notes',
        'Receipt URL',
        'Created At (IST)',
        'Updated At (IST)',
        'Record ID'
      ].join(',');
      
      const lines = rows.map((r: any) => {
        const date = r.date || '';
        const category = (r.category || 'Uncategorized').replace(/"/g, '""');
        const merchant = (r.merchant || '').replace(/"/g, '""');
        const desc = (r.description || '').replace(/"/g, '""');
        const amt = r.amount_minor ? FinanceMath.minorToInr(parseInt(r.amount_minor, 10)).toFixed(2) : '0.00';
        const paymentMethod = (r.payment_method || '').replace(/"/g, '""');
        const source = (r.source || 'manual').replace(/"/g, '""');
        const notes = (r.notes || '').replace(/"/g, '""');
        const receiptUrl = (r.receipt_url || '').replace(/"/g, '""');
        const createdAt = r.created_at || '';
        const updatedAt = r.updated_at || '';
        const recordId = r.id || '';
        
        return [
          `"${date}"`,
          `"${category}"`,
          `"${merchant}"`,
          `"${desc}"`,
          `"${amt}"`,
          `"${currency}"`,
          `"${paymentMethod}"`,
          `"${source}"`,
          `"${notes}"`,
          `"${receiptUrl}"`,
          `"${createdAt}"`,
          `"${updatedAt}"`,
          `"${recordId}"`
        ].join(',');
      });
      
      const csv = [headers, ...lines].join('\n');

      const timestamp = formatIST(new Date(), 'datetime').replace(/[: ]/g, '_').replace(/,/g, '');
      const filename = `smartspend-expenses-${userId}-${timestamp}.csv`;

      return new NextResponse(csv, {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: JSON
    const json = JSON.stringify(exportData, null, 2);
    
    const timestamp = formatIST(new Date(), 'datetime').replace(/[: ]/g, '_').replace(/,/g, '');
    const filename = `smartspend-export-${userId}-${timestamp}.json`;
    
    return new NextResponse(json, {
      headers: {
        'Content-Type':        'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (err) {
    console.error('[GET /api/settings/export]', err);
    return NextResponse.json({ ok: false, error: 'Export failed.' }, { status: 500 });
  }
}

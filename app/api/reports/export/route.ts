import { NextRequest } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { query } from '@/lib/db';
import { Math as FinanceMath } from '@/lib/finance';
import { formatDateIST, formatIST } from '@/lib/time/time.service';

/**
 * GET /api/reports/export?startDate=...&endDate=...&category=...&search=...&paymentMethod=...
 *
 * Generates and streams a downloadable CSV for expense history.
 * - Uses amount_minor (integer) column and converts to INR for display
 * - All timestamps displayed in IST (Asia/Kolkata)
 * - Respects UI filters (date range, category, search, payment method)
 * - Includes all essential columns for accounting reconciliation
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const userId = (session.user as any).id as string;
  const searchParams = req.nextUrl.searchParams;

  // Parse filters from query params
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const paymentMethod = searchParams.get('paymentMethod');

  try {
    // Build WHERE clause dynamically based on filters
    const conditions = ['e.user_id = ?', 'e.deleted_at IS NULL'];
    const params: any[] = [userId];

    if (startDate) {
      conditions.push('e.expense_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('e.expense_date <= ?');
      params.push(endDate);
    }
    if (category && category !== 'all') {
      conditions.push('c.name = ?');
      params.push(category);
    }
    if (search) {
      conditions.push('(e.description LIKE ? OR e.merchant LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (paymentMethod && paymentMethod !== 'all') {
      conditions.push('e.payment_method = ?');
      params.push(paymentMethod);
    }

    const list = await query<{
      id: number;
      expense_date: string;
      category: string;
      amount_minor: number;
      description: string;
      payment_method: string;
      merchant: string | null;
      source: string;
      created_at: Date;
      updated_at: Date;
    }[]>(
      `SELECT 
         e.id,
         e.expense_date, 
         c.name AS category, 
         e.amount_minor, 
         e.description,
         e.payment_method,
         e.merchant,
         e.source,
         e.created_at,
         e.updated_at
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.expense_date DESC, e.created_at DESC`,
      params
    );

    // Generate CSV contents with IST timestamps
    const header = [
      'Date',
      'Category',
      'Amount (INR)',
      'Description',
      'Payment Method',
      'Merchant',
      'Source',
      'Created At (IST)',
      'Updated At (IST)',
      'Record ID'
    ].join(',') + '\n';

    const rows = list.map(r => {
      const date = r.expense_date || '';
      const category = (r.category || 'Uncategorized').replace(/"/g, '""');
      const amount = FinanceMath.minorToInr(r.amount_minor).toFixed(2);
      const description = (r.description || '').replace(/"/g, '""');
      const paymentMethod = (r.payment_method || '').replace(/"/g, '""');
      const merchant = (r.merchant || '').replace(/"/g, '""');
      const source = (r.source || 'manual').replace(/"/g, '""');
      const createdAt = r.created_at ? formatIST(new Date(r.created_at), 'datetime') : '';
      const updatedAt = r.updated_at ? formatIST(new Date(r.updated_at), 'datetime') : '';
      const recordId = r.id || '';

      return [
        `"${date}"`,
        `"${category}"`,
        `"${amount}"`,
        `"${description}"`,
        `"${paymentMethod}"`,
        `"${merchant}"`,
        `"${source}"`,
        `"${createdAt}"`,
        `"${updatedAt}"`,
        `"${recordId}"`
      ].join(',');
    }).join('\n');

    const csvContent = header + rows;

    // Generate filename with IST timestamp and filter description
    const timestamp = formatIST(new Date(), 'datetime').replace(/[: ]/g, '_').replace(/,/g, '');
    let filterDesc = '';
    if (startDate || endDate) {
      filterDesc += `_${startDate || 'start'}_to_${endDate || 'end'}`;
    }
    if (category && category !== 'all') {
      filterDesc += `_${category.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    const filename = `smartspend_expenses${filterDesc}_${timestamp}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (err: any) {
    console.error('[GET /api/reports/export]', err);
    return new Response('Failed to generate export file.', { status: 500 });
  }
}

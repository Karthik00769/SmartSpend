import { NextRequest } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { query } from '@/lib/db';
import { Math as FinanceMath } from '@/lib/finance';

/**
 * GET /api/reports/export?months=6
 *
 * Generates and streams a downloadable CSV for full expense history.
 * Uses amount_paise (integer) column and converts to INR for display.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const userId = (session.user as any).id as string;

  try {
    const list = await query<{
      expense_date: string;
      category:     string;
      amount_paise: number;
      description:  string;
    }[]>(
      `SELECT expense_date, category, amount_paise, description
       FROM expenses
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY expense_date DESC`,
      [userId]
    );

    // Generate CSV contents — convert paise to INR via FinanceCore
    const header = 'Date,Category,Amount (INR),Description\n';
    const rows = list.map(r =>
      `"${r.expense_date}","${r.category}","${FinanceMath.paiseToInr(r.amount_paise).toFixed(2)}","${r.description.replace(/"/g, '""')}"`
    ).join('\n');

    const csvContent = header + rows;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="smartspend_expenses_export.csv"`,
      },
    });

  } catch (err: any) {
    console.error('[GET /api/reports/export]', err);
    return new Response('Failed to generate export file.', { status: 500 });
  }
}

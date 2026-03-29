import { NextRequest } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { query } from '@/lib/db';

/**
 * GET /api/reports/export?months=6
 * 
 * Generates and streams a downloadable spreadsheet for full history expenses list.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const userId = (session.user as any).id as string;

  try {
    const list = await query<{
      expense_date: string;
      category: string;
      amount: string;
      description: string;
    }[]>(
      `SELECT expense_date, category, amount, description FROM expenses WHERE user_id = ? ORDER BY expense_date DESC`,
      [userId]
    );

    // Generate CSV contents
    const header = 'Date,Category,Amount,Description\n';
    const rows = list.map(r => 
      `"${r.expense_date}","${r.category}","${parseFloat(r.amount).toFixed(2)}","${r.description.replace(/"/g, '""')}"`
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

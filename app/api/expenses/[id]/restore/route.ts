/**
 * app/api/expenses/[id]/restore/route.ts
 * POST /api/expenses/:id/restore — restore soft-deleted expense
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { ok, fail } from '@/lib/api-response';
import { restoreExpense } from '@/services/expense.service';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const { id } = await params;

  try {
    const expense = await restoreExpense(id, userId);
    return ok({ 
      expense,
      message: 'Expense restored successfully.' 
    });
  } catch (err: any) {
    console.error('[POST /api/expenses/:id/restore]', err);
    return fail(err.message || 'Failed to restore expense.', 500);
  }
}

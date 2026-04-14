/**
 * app/api/budgets/[id]/route.ts
 * DELETE /api/budgets/:id — soft delete (sets deleted_at)
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions }      from '@/lib/auth/authOptions';
import { ok, fail }         from '@/lib/api-response';
import { deleteBudget }     from '@/services/budget.service';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const id     = parseInt(params.id, 10);
  if (isNaN(id)) return fail('Invalid budget id.', 400);

  try {
    await deleteBudget(id, userId);
    return ok({ deleted: true });
  } catch (err: any) {
    console.error('[DELETE /api/budgets/:id]', err);
    return fail(err.message || 'Failed to delete budget.', 500);
  }
}

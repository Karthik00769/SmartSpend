/**
 * app/api/expenses/[id]/route.ts
 * PATCH /api/expenses/:id  — edit amount, description, category, date
 * DELETE /api/expenses/:id — soft delete (sets deleted_at)
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession }       from 'next-auth/next';
import { authOptions }            from '@/lib/auth/authOptions';
import { ok, fail }               from '@/lib/api-response';
import { parseBody }              from '@/lib/validate';
import { updateExpense, softDeleteExpense, findOrCreateCategory } from '@/services/expense.service';

const PatchExpenseSchema = z.object({
  amount:       z.coerce.number().positive().optional(),
  description:  z.string().trim().max(500).optional(),
  // NOTE: 'date' is intentionally excluded — expense date is set at creation
  // time (always today) and cannot be changed after the fact.
  categoryId:   z.coerce.number().min(1).optional(),
  categoryName: z.string().trim().max(100).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const id     = params.id;

  const parsed = await parseBody(req, PatchExpenseSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    let { categoryId, categoryName, ...rest } = parsed.data;

    // Resolve category: id takes priority, then name (find-or-create)
    if (!categoryId && categoryName) {
      categoryId = await findOrCreateCategory(userId, categoryName);
    }

    // Expense date is immutable after creation — never allow editing it.
    const { date: _discardedDate, ...safeRest } = rest as any;

    const updated = await updateExpense(id, userId, { ...safeRest, categoryId });
    return ok({ expense: updated });
  } catch (err: any) {
    console.error('[PATCH /api/expenses/:id]', err);
    return fail(err.message || 'Failed to update expense.', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    await softDeleteExpense(params.id, userId);
    return ok({ deleted: true });
  } catch (err: any) {
    console.error('[DELETE /api/expenses/:id]', err);
    return fail(err.message || 'Failed to delete expense.', 500);
  }
}

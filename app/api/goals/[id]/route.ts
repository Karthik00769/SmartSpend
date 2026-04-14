/**
 * app/api/goals/[id]/route.ts
 * PATCH  /api/goals/:id — edit title, description, targetAmount, deadline, priority, status
 * DELETE /api/goals/:id — soft delete
 */
import { NextRequest } from 'next/server';
import { z }                from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions }      from '@/lib/auth/authOptions';
import { ok, fail }         from '@/lib/api-response';
import { parseBody }        from '@/lib/validate';
import { updateGoal, softDeleteGoal } from '@/services/goal.service';

const PatchGoalSchema = z.object({
  title:        z.string().trim().min(1).max(150).optional(),
  description:  z.string().trim().max(1000).optional(),
  targetAmount: z.coerce.number().positive().optional(),
  deadline:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority:     z.enum(['low', 'medium', 'high']).optional(),
  status:       z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const { id } = await params;
  const goalId = parseInt(id, 10);
  if (isNaN(goalId)) return fail('Invalid goal id.', 400);

  const parsed = await parseBody(req, PatchGoalSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const updated = await updateGoal(goalId, userId, parsed.data);
    if (!updated) return fail('Goal not found.', 404);
    return ok({ goal: updated });
  } catch (err: any) {
    console.error('[PATCH /api/goals/:id]', err);
    return fail(err.message || 'Failed to update goal.', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const { id } = await params;
  const goalId = parseInt(id, 10);
  if (isNaN(goalId)) return fail('Invalid goal id.', 400);

  try {
    await softDeleteGoal(goalId, userId);
    return ok({ deleted: true });
  } catch (err: any) {
    console.error('[DELETE /api/goals/:id]', err);
    return fail(err.message || 'Failed to delete goal.', 500);
  }
}

/**
 * app/api/goals/[id]/progress/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * POST /api/goals/[id]/progress
 *
 * Increments the `saved_amount` for a goal.
 * Expects { amount: number } in body.
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { updateGoalProgress } from '@/services/goal.service';
import * as FinanceCore from '@/lib/finance';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const { id } = await params;
  const userId = (session.user as any).id as string;
  const goalId = parseInt(id);

  try {
    const { amount } = await req.json();
    if (typeof amount !== 'number' || amount <= 0) {
      return fail('Invalid deposit amount.', 400);
    }

    const amountPaise = FinanceCore.Math.inrToPaise(amount);
    const updated = await updateGoalProgress(goalId, userId, amountPaise);
    if (!updated) {
      return fail('Goal not found or unauthorized.', 404);
    }

    return ok({ goal: updated });
  } catch (err) {
    console.error('[POST /api/goals/:id/progress]', err);
    return fail('Failed to update goal progress.', 500);
  }
}

/**
 * app/api/goals/status/route.ts
 * GET /api/goals/status
 * Returns user's expense history duration + long-term unlock status
 *
 * All responses use the { ok, data } / { ok, error } envelope.
 */
import { NextRequest } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { checkGoalUnlockStatus } from '@/services/goal.service';
import { ok, fail } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const status = await checkGoalUnlockStatus(userId);
    return ok(status);
  } catch (error) {
    console.error('[GET /api/goals/status]', error);
    return fail('Failed to fetch goal status.', 500);
  }
}

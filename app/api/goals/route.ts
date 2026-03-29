/**
 * app/api/goals/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  /api/goals             — list goals (filtered by status)
 * POST /api/goals             — create a new savings goal
 *
 * Example calls:
 *
 *   GET /api/goals?userId=1&status=active
 *
 *   POST /api/goals
 *   {
 *     "title": "Emergency Fund",
 *     "targetAmount": 10000,
 *     "targetDate": "2026-12-31",
 *     "priority": "high",
 *     "description": "3 months of expenses"
 *   }
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { parseBody, parseQuery, CreateGoalSchema, GetGoalsQuerySchema } from '@/lib/validate';
import { listGoals, createGoal } from '@/services/goal.service';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = parseQuery(req.nextUrl.searchParams, GetGoalsQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const queryData = parsed.data as any;
    queryData.userId = (session.user as any).id;
    const goals = await listGoals(queryData);
    return ok({ goals, count: goals.length });
  } catch (err) {
    console.error('[GET /api/goals]', err);
    return fail('Failed to fetch goals.', 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = await parseBody(req, CreateGoalSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const bodyData = parsed.data as any;
    bodyData.userId = (session.user as any).id;
    const goal = await createGoal(bodyData);
    return ok({ goal }, 201);

  } catch (err) {
    console.error('[POST /api/goals]', err);
    return fail('Failed to create goal.', 500);
  }
}

/**
 * app/api/budgets/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  /api/budgets           — monthly budget summary with live spend
 * POST /api/budgets           — create or update a category budget (upsert)
 *
 * Example calls:
 *
 *   GET /api/budgets?userId=1&year=2026&month=3
 *
 *   POST /api/budgets
 *   { "categoryId": 1, "limitAmount": 500, "month": 3, "year": 2026 }
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { parseBody, parseQuery, UpsertBudgetSchema, GetBudgetsQuerySchema } from '@/lib/validate';
import { listBudgets, upsertBudget } from '@/services/budget.service';
import * as FinanceCore from '@/lib/finance';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = parseQuery(req.nextUrl.searchParams, GetBudgetsQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const queryData = parsed.data as any;
    queryData.userId = (session.user as any).id;
    const summary = await listBudgets(queryData);
    return ok(summary);
  } catch (err) {
    console.error('[GET /api/budgets]', err);
    return fail('Failed to fetch budgets.', 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = await parseBody(req, UpsertBudgetSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const { amount, ...rest } = parsed.data as any;
    const bodyData = { ...rest, amountPaise: FinanceCore.Math.inrToPaise(amount) };
    bodyData.userId = (session.user as any).id;

    // ── ENFORCE ONLY CURRENT OR FUTURE MONTHS ────
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear  = now.getFullYear();

    if (bodyData.year < currentYear || (bodyData.year === currentYear && bodyData.month < currentMonth)) {
      return fail('Cannot modify past budgets.', 400);
    }

    const summary = await upsertBudget(bodyData);
    return ok(summary, 201);

  } catch (err: any) {
    console.error('[POST /api/budgets]', err?.message ?? err);
    // Surface validation/FK errors (category not found, missing fields) as 400
    const msg: string = err?.message ?? 'Failed to save budget.';
    const isUserError = msg.includes('not found') || msg.includes('Missing required') || msg.includes('does not belong');
    return fail(msg, isUserError ? 400 : 500);
  }
}

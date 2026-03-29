/**
 * app/api/expenses/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  /api/expenses  — list (Zod-validated query params)
 * POST /api/expenses  — create via Expense Processing Engine
 *
 * POST pipeline:
 *   Zod boundary parse → Engine validate → Engine categorize →
 *   Engine enrich → DB insert → return ProcessedExpense + metadata
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { parseBody, parseQuery, GetExpensesQuerySchema } from '@/lib/validate';
import { z } from 'zod';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";

import { listExpenses } from '@/services/expense.service';
import { processExpense } from '@/lib/expense-engine';

// ── Loose intake schema — engine does the deep validation ─────────────────────
const ExpenseIntakeSchema = z.object({
  userId:      z.union([z.string(), z.number()]).transform(String).optional(),
  categoryId:  z.preprocess((val) => Number(val), z.number()).optional(),
  amount:      z.union([z.string(), z.number()]),
  date:        z.string(),
  description: z.string().trim().max(500).default(''),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = parseQuery(req.nextUrl.searchParams, GetExpensesQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const queryData = parsed.data as any;
    queryData.userId = (session.user as any).id;
    const expenses = await listExpenses(queryData);
    return ok({ expenses, count: expenses.length });
  } catch (err) {
    console.error('[GET /api/expenses]', err);
    return fail('Failed to fetch expenses.', 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  // ── 1. Boundary parse (Zod) ───────────────────────────────────────────────
  const parsed = await parseBody(req, ExpenseIntakeSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  const userId = (session.user as any).id as string;

  // ── 2. Run through the Expense Processing Engine ──────────────────────────
  try {
    const result = await processExpense(
      {
        userId:      userId as string,
        categoryId:  parsed.data.categoryId,
        amount:      parsed.data.amount as any,
        date:        parsed.data.date,
        description: parsed.data.description,
      },
      userId as string,
    );


    // Engine validation failed — return 422 with field errors
    if (!result.validation.valid) {
      const details: Record<string, string[]> = {};
      for (const e of result.validation.errors) {
        details[e.field] = [...(details[e.field] ?? []), e.message];
      }
      return fail('Expense validation failed.', 422, details);
    }

    return ok(
      {
        expense:        result.savedExpense, // fully populated DTO containing categoryName/categoryIcon
        expenseId:      result.savedExpenseId,
        processed:      result.processed,
        categorization: result.categorization,
      },
      201,
    );
  } catch (err) {
    console.error('[POST /api/expenses]', err);
    return fail('Failed to save expense. Check database connection.', 500);
  }
}

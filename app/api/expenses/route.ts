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

import { listExpenses, findOrCreateCategory, countExpenses } from '@/services/expense.service';
import { processExpense } from '@/lib/expense-engine';

// ── Loose intake schema — engine does the deep validation ─────────────────────
const ExpenseIntakeSchema = z.object({
  userId:       z.union([z.string(), z.number()]).transform(String).optional(),
  categoryId:   z.preprocess((val) => val != null && val !== '' ? Number(val) : undefined, z.number().optional()),
  categoryName: z.string().trim().max(100).optional(),
  amount:       z.union([z.string(), z.number()]),
  date:         z.string(),
  description:  z.string().trim().max(500).default(''),
  source:       z.enum(['manual', 'receipt_scan', 'bank_import']).default('manual'),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const parsed = parseQuery(req.nextUrl.searchParams, GetExpensesQuerySchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const queryData = { ...parsed.data, userId: (session.user as any).id } as any;
    const [expenses, total] = await Promise.all([
      listExpenses(queryData),
      countExpenses(queryData),
    ]);
    return ok({ expenses, count: expenses.length, total });
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

  try {
    // Resolve categoryId from name if not provided
    let resolvedCategoryId = parsed.data.categoryId;
    if (!resolvedCategoryId && parsed.data.categoryName) {
      resolvedCategoryId = await findOrCreateCategory(
        userId,
        parsed.data.categoryName,
      );
    }

    // ── VALIDATE DATE — accept historical dates up to 1 year back ────────────
    // Allow user-provided date (e.g. from a receipt or manual entry) unless:
    //  - Date is in the future (use today instead)
    //  - Date is more than 365 days old (clamp to 1 year ago)
    const todayDate = new Date().toISOString().slice(0, 10);
    let expenseDate = parsed.data.date || todayDate;
    const dateParsed = new Date(expenseDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (isNaN(dateParsed.getTime()) || dateParsed > today) {
      expenseDate = todayDate; // future/invalid → use today
    } else if (dateParsed < oneYearAgo) {
      expenseDate = oneYearAgo.toISOString().slice(0, 10); // clamp to 1 year ago
    }

    const result = await processExpense(
      {
        userId:      userId as string,
        categoryId:  resolvedCategoryId,
        amount:      parsed.data.amount as any,
        date:        expenseDate,
        description: parsed.data.description,
        source:      parsed.data.source,
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
        expense:        result.savedExpense,
        expenseId:      result.savedExpenseId,
        processed:      result.processed,
        categorization: result.categorization,
      },
      201,
    );
  } catch (err: any) {
    console.error('[POST /api/expenses]', err);
    // Surface duplicate and category errors as 409/400 rather than 500
    if (err.message?.includes('Duplicate expense')) return fail(err.message, 409);
    if (err.message?.includes('not found') || err.message?.includes('does not belong')) return fail(err.message, 400);
    return fail('Failed to save expense. Check database connection.', 500);
  }
}

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
import { getCategoryBudgetStatus } from '@/services/budget.service';
import { getActiveGoalsProgress } from '@/services/goal.service';

import * as FinanceCore from '@/lib/finance';

const IntakeAdapterSchema = z.object({
  userId:       z.union([z.string(), z.number()]).transform(String).optional(),
  categoryId:   z.preprocess((val) => val != null && val !== '' ? Number(val) : undefined, z.number().optional()),
  categoryName: z.string().trim().max(100).optional(),
  amount:       z.coerce.number(),
  date:         z.string(),
  description:  z.string().default(''),
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
  const parsed = await parseBody(req, IntakeAdapterSchema);
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

    // ── FINANCIAL CORE BOUNDARY ──────────────────────────────────────────────
    const amountPaise = FinanceCore.Math.inrToPaise(parsed.data.amount);
    const sanitizedMerchant = FinanceCore.Parsing.sanitizeMerchantName(parsed.data.description);

    const validationResult = FinanceCore.Validation.CreateExpenseInputSchema.safeParse({
      userId,
      categoryId: resolvedCategoryId,
      amountPaise,
      date: parsed.data.date,
      merchantName: sanitizedMerchant,
      description: parsed.data.description,
    });

    if (!validationResult.success) {
      const details: Record<string, string[]> = {};
      for (const issue of validationResult.error.issues) {
        const key = issue.path.join('.') || '_root';
        details[key] = [...(details[key] ?? []), issue.message];
      }
      return fail('Expense validation failed.', 422, details);
    }

    const coreData = validationResult.data;
    const dateAdjusted = false;

    const result = await processExpense(
      {
        userId:      coreData.userId as string,
        categoryId:  coreData.categoryId,
        amountPaise: coreData.amountPaise,
        date:        coreData.date,
        description: coreData.merchantName,
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

    // ── 3. Check Budget & Goal Impact ─────────────────────────────────────────
    const expenseDate = new Date(parsed.data.date);
    const [budgetStatus, goalStatus] = await Promise.all([
      getCategoryBudgetStatus(
        userId,
        result.categorization.categoryId,
        expenseDate.getMonth() + 1,
        expenseDate.getFullYear()
      ),
      getActiveGoalsProgress(userId)
    ]);

    return ok(
      {
        expense:        result.savedExpense,
        dateAdjusted,
        message:        `Expense added for ${parsed.data.date}`,
        budgetStatus:   budgetStatus ? { usedPercent: budgetStatus.percent, status: budgetStatus.status } : null,
        goalStatus,
        // legacy compat
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

/**
 * lib/validate.ts
 * ─────────────────────────────────────────────────────────────────────
 * Zod schema definitions for all API inputs.
 *
 * Pattern
 * ───────
 * 1. Define a Zod schema (e.g. CreateExpenseSchema).
 * 2. Export the inferred TypeScript type alongside it.
 * 3. Call `parseBody(req, Schema)` in a route handler; it returns
 *    { data } on success or { error } on failure — never throws.
 */

import { z, ZodSchema } from 'zod';
import { NextRequest } from 'next/server';

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Parse + validate a JSON request body against a Zod schema. */
export async function parseBody<T>(
  req: NextRequest,
  schema: z.ZodType<T, any, any>,
): Promise<

  | { success: true;  data: T }
  | { success: false; fieldErrors: Record<string, string[]>; message: string }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      success:     false,
      fieldErrors: {},
      message:     'Request body must be valid JSON.',
    };
  }

  const result = schema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_root';
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }

  return {
    success:     false,
    fieldErrors,
    message: 'Validation failed — see "details" for field-level errors.',
  };
}

/** Parse + coerce URL search params into a plain object then validate. */
export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodType<T, any, any>,
):

  | { success: true;  data: T }
  | { success: false; fieldErrors: Record<string, string[]>; message: string }
{
  const raw: Record<string, string> = {};
  searchParams.forEach((v, k) => { raw[k] = v; });

  const result = schema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_root';
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }

  return {
    success:     false,
    fieldErrors,
    message: 'Invalid query parameters — see "details".',
  };
}

// ─── Re-usable field primitives ───────────────────────────────────────────────

/** BIGINT-safe user ID — accepts numeric string or number */
const UserIdField = z
  .union([z.string(), z.number()])
  .transform(String);

const PositiveDecimal = z
  .union([z.string(), z.number()])
  .transform(v => parseFloat(String(v)))
  .refine(v => v > 0, 'Must be a positive number');

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

const Month = z
  .union([z.string(), z.number()])
  .transform(Number)
  .refine(v => v >= 1 && v <= 12, 'Month must be 1-12');

const Year = z
  .union([z.string(), z.number()])
  .transform(Number)
  .refine(v => v >= 2000 && v <= 2100, 'Year must be between 2000 and 2100');

// ─── Expense schemas ─────────────────────────────────────────────────────────

export const CreateExpenseSchema = z.object({
  userId:      UserIdField.optional(),
  category:    z.string().trim().min(1).default('Other'),
  amount:      PositiveDecimal,
  date:        ISODate,
  description: z.string().trim().max(500).default(''),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

export const GetExpensesQuerySchema = z.object({
  userId:     UserIdField.optional(),
  year:       Year.optional(),
  month:      Month.optional(),
  limit:      z.union([z.string(), z.number()])
                .transform(Number)
                .refine(v => v >= 1 && v <= 500, 'Limit must be 1-500')
                .default(50),
  offset:     z.union([z.string(), z.number()])
                .transform(Number)
                .default(0),
  search:     z.string().trim().max(200).optional(),
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minAmount:  z.union([z.string(), z.number()]).transform(Number).optional(),
  maxAmount:  z.union([z.string(), z.number()]).transform(Number).optional(),
  source:     z.enum(['manual', 'receipt_scan', 'bank_import']).optional(),
  categoryId: z.union([z.string(), z.number()]).transform(Number).optional(),
});
export type GetExpensesQuery = z.infer<typeof GetExpensesQuerySchema>;

// ─── Budget schemas ──────────────────────────────────────────────────────────

export const UpsertBudgetSchema = z.object({
  userId:     UserIdField.optional(),
  categoryId: z.preprocess((val) => Number(val), z.number().min(1, 'Category is required')),
  category:   z.string().trim().optional(), // kept for backwards compat
  amount:     PositiveDecimal,
  month:      Month,
  year:       Year,
}).refine(data => {
  // Budgets cannot be created for past months
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const y = Number(data.year);
  const m = Number(data.month);
  return (y > currentYear) || (y === currentYear && m >= currentMonth);
}, { message: 'Budget cannot be set for a past month', path: ['month'] });
export type UpsertBudgetInput = z.infer<typeof UpsertBudgetSchema>;

export const GetBudgetsQuerySchema = z.object({
  userId: UserIdField.optional(),
  month:  Month.optional(),
  year:   Year.optional(),
});
export type GetBudgetsQuery = z.infer<typeof GetBudgetsQuerySchema>;

// ─── Goal schemas ─────────────────────────────────────────────────────────────

export const CreateGoalSchema = z.object({
  userId:       UserIdField.optional(),
  title:        z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  description:  z.string().trim().max(1000).optional().default(''),
  targetAmount: PositiveDecimal,
  deadline:     ISODate.refine(d => {
    const parsed = new Date(d + 'T00:00:00Z');
    const today  = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return parsed >= today;
  }, 'Goal deadline cannot be in the past'),
  priority:     z.enum(['low', 'medium', 'high']).default('medium'),
  goalType:     z.enum(['short_term', 'long_term', 'short', 'long'])
                  .transform(v => v === 'short' ? 'short_term' : v === 'long' ? 'long_term' : v)
                  .default('short_term'),
});
export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;

export const GetGoalsQuerySchema = z.object({
  userId: UserIdField.optional(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled', 'all']).optional(),
});
export type GetGoalsQuery = z.infer<typeof GetGoalsQuerySchema>;

// ─── Insight schemas ──────────────────────────────────────────────────────────

export const GetInsightsQuerySchema = z.object({
  userId:     UserIdField.optional(),
  unreadOnly: z.string().transform(v => v === 'true').default('false'),
});
export type GetInsightsQuery = z.infer<typeof GetInsightsQuerySchema>;

export const MarkInsightsReadSchema = z.object({
  userId: UserIdField.optional(),
});
export type MarkInsightsReadInput = z.infer<typeof MarkInsightsReadSchema>;

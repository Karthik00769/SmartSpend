/**
 * lib/expense-engine/validator.ts
 * ─────────────────────────────────────────────────────────────────────
 * Pure validation layer for expense inputs.
 * Uses Zod and the Financial Core for standard boundary checks.
 */

import { EngineExpenseInput, ValidationResult, ValidationError, ProcessedExpense } from './types';
import * as FinanceCore from '../finance';
import { z } from 'zod';
import { MIN_AMOUNT_INR, MAX_AMOUNT_INR, MAX_DESCRIPTION_LENGTH } from '../finance/constants/limits';
import { isFutureDateIST } from '../finance/dates/timezone';

const EngineInputSchema = z.object({
  amountPaise: z.number().int().min(MIN_AMOUNT_INR * 100, `Amount must be at least ₹${MIN_AMOUNT_INR}`).max(MAX_AMOUNT_INR * 100, `Amount cannot exceed ₹${MAX_AMOUNT_INR}`),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.').refine(d => {
    const parsed = new Date(d + 'T00:00:00Z');
    return !isNaN(parsed.getTime());
  }, 'Date is not a valid calendar date.').refine(d => {
    const parsed = new Date(d + 'T00:00:00Z');
    return parsed >= new Date('2000-01-01');
  }, 'Expense date cannot be before year 2000.').refine(d => !isFutureDateIST(d), 'Future dates are not allowed.'),
  description: z.string().max(MAX_DESCRIPTION_LENGTH, `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`).optional().refine(val => {
    if (!val) return true;
    return !/<script|javascript:/i.test(val);
  }, 'Description contains invalid characters.'),
  categoryId: z.union([z.string(), z.number()]).optional(),
  source: z.enum(['manual', 'receipt_scan', 'bank_import']).optional(),
});

/** Get ISO week number (1-53) from a Date — Monday-based */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to nearest Thursday: current date + 4 - current ISO day number
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Get the Monday of a week containing the given date */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * validateExpense
 * Runs Zod schema validation using Financial Core rules.
 * Returns { valid, errors } — never throws.
 */
export function validateExpense(input: EngineExpenseInput): ValidationResult {
  const parsed = EngineInputSchema.safeParse(input);
  
  if (parsed.success) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = parsed.error.issues.map((issue: any) => ({
    field: issue.path.join('.'),
    message: issue.message,
    value: (input as any)[issue.path[0] || ''],
  }));

  return { valid: false, errors };
}

/**
 * enrichExpense
 * Given a validated raw input + resolved categoryId, enrich it with computed
 * temporal fields (week number, day of week, etc.).
 * Call AFTER validateExpense returns { valid: true }.
 */
export function enrichExpense(
  input:      EngineExpenseInput,
  categoryId: number,
  userId:     string,
): ProcessedExpense {
  const date      = new Date(input.date + 'T00:00:00Z');
  const week      = getISOWeek(date);
  const weekStart = getWeekStart(date);
  const weekEnd   = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  return {
    userId,
    categoryId,
    amountPaise:   input.amountPaise,
    date:          input.date,
    description:   input.description?.trim() ?? '',
    week,
    weekLabel:     `Week ${week}, ${date.getUTCFullYear()}`,
    month:         date.getUTCMonth() + 1,
    year:          date.getUTCFullYear(),
    dayOfWeek:     DAY_NAMES[date.getUTCDay()],
    autoCategized: false, // will be flipped by categorizer if needed
    needsReview:   false, // populated during orchestration
    confidenceScore: 0,   // populated during orchestration
  };
}

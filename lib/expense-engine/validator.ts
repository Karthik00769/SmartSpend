/**
 * lib/expense-engine/validator.ts
 * ─────────────────────────────────────────────────────────────────────
 * Pure validation layer for expense inputs.
 * Uses Zod and the Financial Core for standard boundary checks.
 */

import { z } from 'zod';
import { MIN_AMOUNT_INR, MAX_AMOUNT_INR, MAX_DESCRIPTION_LENGTH } from '../finance/constants/limits';
import { isFutureDateIST } from '../finance/dates/timezone';
import { inrToPaise } from '../finance/calculations/math';

import type {
  RawExpenseInput,
  ValidationResult,
  ValidationError,
  ProcessedExpense,
} from './types';

// ─── Zod Schema for Raw Input ───────────────────────────────────────────────────

const RawExpenseSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((val, ctx) => {
    const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
    if (isNaN(num)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be a valid number.' });
      return z.NEVER;
    }
    if (num < MIN_AMOUNT_INR) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Amount must be at least $${MIN_AMOUNT_INR}.` });
      return z.NEVER;
    }
    if (num > MAX_AMOUNT_INR) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Amount cannot exceed $${MAX_AMOUNT_INR.toLocaleString()}.` });
      return z.NEVER;
    }
    if (!isFinite(num)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be a finite number.' });
      return z.NEVER;
    }
    return num;
  }),
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
});

// ─── Date utility helpers ─────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * validateExpense
 * Runs Zod schema validation using Financial Core rules.
 * Returns { valid, errors } — never throws.
 */
export function validateExpense(input: RawExpenseInput): ValidationResult {
  const parsed = RawExpenseSchema.safeParse(input);
  
  if (parsed.success) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = parsed.error.issues.map(issue => ({
    field: issue.path[0]?.toString() || 'unknown',
    message: issue.message,
    value: (input as any)[issue.path[0] || ''],
  }));

  return { valid: false, errors };
}

/**
 * enrichExpense
 * Given a validated raw input + resolved categoryId, enrich it with computed
 * temporal fields (week number, day of week, etc.).
 * Converts amount to Paise using Financial Core.
 * Call AFTER validateExpense returns { valid: true }.
 */
export function enrichExpense(
  input:      RawExpenseInput,
  categoryId: number,
  userId:     string,
): ProcessedExpense {
  const date      = new Date(input.date + 'T00:00:00Z');
  const week      = getISOWeek(date);
  const weekStart = getWeekStart(date);
  const weekEnd   = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  // Convert float string/number to paise using core library
  const floatAmount = typeof input.amount === 'string' ? parseFloat(input.amount.replace(/,/g, '')) : input.amount;
  const amountPaise = inrToPaise(floatAmount);

  return {
    userId,
    categoryId,
    amount:        amountPaise,
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

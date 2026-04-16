/**
 * lib/expense-engine/validator.ts
 * ─────────────────────────────────────────────────────────────────────
 * Pure validation layer for expense inputs.
 *
 * Why separate from Zod schemas in lib/validate.ts?
 * Zod handles HTTP boundary parsing. This module handles deeper business
 * rules: date cannot be in the future, amount cannot exceed a sanity cap,
 * weekend vs weekday flags, duplicate detection, etc.
 *
 * All functions are pure (no side effects, no DB calls).
 */

import type {
  RawExpenseInput,
  ValidationResult,
  ValidationError,
  ProcessedExpense,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_EXPENSE_AMOUNT = 1_000_000;   // sanity cap — $1M
const MIN_EXPENSE_AMOUNT = 0.01;
const MIN_DATE            = new Date('2000-01-01');

// ─── Field validators ─────────────────────────────────────────────────────────

function validateAmount(raw: string | number): ValidationError[] {
  const errors: ValidationError[] = [];
  const val = parseFloat(String(raw));

  if (isNaN(val)) {
    errors.push({ field: 'amount', message: 'Amount must be a valid number.', value: raw });
    return errors;
  }
  if (val < MIN_EXPENSE_AMOUNT) {
    errors.push({ field: 'amount', message: `Amount must be at least $${MIN_EXPENSE_AMOUNT}.`, value: val });
  }
  if (val > MAX_EXPENSE_AMOUNT) {
    errors.push({ field: 'amount', message: `Amount cannot exceed $${MAX_EXPENSE_AMOUNT.toLocaleString()}.`, value: val });
  }
  if (!isFinite(val)) {
    errors.push({ field: 'amount', message: 'Amount must be a finite number.', value: val });
  }
  return errors;
}

function validateDate(raw: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format.', value: raw });
    return errors;
  }

  const parsed = new Date(raw + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) {
    errors.push({ field: 'date', message: 'Date is not a valid calendar date.', value: raw });
    return errors;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  if (parsed > today) {
    errors.push({ field: 'date', message: 'Future dates are not allowed.', value: raw });
  }
  if (parsed < MIN_DATE) {
    errors.push({ field: 'date', message: 'Expense date cannot be before year 2000.', value: raw });
  }

  return errors;
}

function validateDescription(raw: string | undefined): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!raw) return errors; // optional field
  if (raw.length > 500) {
    errors.push({ field: 'description', message: 'Description must be 500 characters or fewer.', value: raw.length });
  }
  // Guard against XSS-y patterns
  if (/<script|javascript:/i.test(raw)) {
    errors.push({ field: 'description', message: 'Description contains invalid characters.', value: raw });
  }
  return errors;
}



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
 * Runs all field-level and business rule validators.
 * Returns { valid, errors } — never throws.
 */
export function validateExpense(input: RawExpenseInput): ValidationResult {
  const errors: ValidationError[] = [
    ...validateAmount(input.amount),
    ...validateDate(input.date),
    ...validateDescription(input.description),
  ];

  return { valid: errors.length === 0, errors };
}

/**
 * enrichExpense
 * Given a validated raw input + resolved categoryId, enrich it with computed
 * temporal fields (week number, day of week, etc.).
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

  return {
    userId,
    categoryId,
    amount:        parseFloat(String(input.amount).replace(',', '')),
    date:          input.date,
    description:   input.description?.trim() ?? '',
    week,
    weekLabel:     `Week ${week}, ${date.getUTCFullYear()}`,
    month:         date.getUTCMonth() + 1,
    year:          date.getUTCFullYear(),
    dayOfWeek:     DAY_NAMES[date.getUTCDay()],
    autoCategized: false, // will be flipped by categorizer if needed
  };
}

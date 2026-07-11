/**
 * lib/finance/validation/schemas.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Consolidated Zod schemas enforcing the Canonical Data Model and Paise math.
 */

import { z } from 'zod';
import { MIN_AMOUNT_INR, MAX_AMOUNT_INR, MAX_MERCHANT_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants/limits';
import { isFutureDateIST } from '../dates/timezone';

// BigInt-safe user ID primitive
const UserIdField = z.union([z.string(), z.number()]).transform(String);

// ISO Date primitive (YYYY-MM-DD)
const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

/**
 * Expense validation strictly enforcing integer inputs (Paise).
 * Note: External UI/APIs must convert INR to Paise before passing to this schema.
 */
export const CanonicalExpenseSchema = z.object({
  userId: UserIdField,
  amountPaise: z.number().int().min(MIN_AMOUNT_INR * 100, `Amount must be at least ₹${MIN_AMOUNT_INR}`).max(MAX_AMOUNT_INR * 100, `Amount cannot exceed ₹${MAX_AMOUNT_INR}`),
  dateISO: ISODate.refine(d => !isFutureDateIST(d), 'Expense date cannot be in the future'),
  categoryId: z.number().int().min(1),
  merchant: z.object({
    raw: z.string().min(1).max(MAX_MERCHANT_LENGTH),
    normalized: z.string().min(1).max(MAX_MERCHANT_LENGTH),
    upiId: z.string().optional(),
    gstin: z.string().optional(),
  }),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
});

export type CanonicalExpense = z.infer<typeof CanonicalExpenseSchema>;

/**
 * Schema for creating a new expense manually.
 * Enforces integer amounts (Paise).
 */
export const CreateExpenseInputSchema = z.object({
  userId: UserIdField.optional(), // Usually injected by the server
  categoryId: z.number().int().min(1),
  amountPaise: z.number().int().min(MIN_AMOUNT_INR * 100).max(MAX_AMOUNT_INR * 100),
  date: ISODate.refine(d => !isFutureDateIST(d), 'Expense date cannot be in the future'),
  merchantName: z.string().trim().min(2, 'Merchant name is too short').max(MAX_MERCHANT_LENGTH, 'Merchant name is too long'),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
});

export type CreateExpenseInput = z.infer<typeof CreateExpenseInputSchema>;

/**
 * lib/validation/schemas.ts
 * ─────────────────────────────────────────────────────────────────────
 * Zod validation schemas for forms.
 * Used by React Hook Form clientside & optionally for API validation serverside.
 */
import { z } from 'zod';

// ─── Expense ───────────────────────────────────────────────────────────────────

export const expenseSchema = z.object({
  amount: z.coerce
    .number({ required_error: 'Amount is required' })
    .positive('Amount must be greater than 0'),
    
  date: z.string().min(1, 'Date is required'),
  
  description: z.string().max(255, 'Description too long').optional(),
  
  categoryId: z.coerce
    .number()
    .optional()
    .or(z.literal('')) // allow empty string for select
    .transform(val => (val === '' ? undefined : Number(val))),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;

// ─── Budget ────────────────────────────────────────────────────────────────────

export const budgetSchema = z.object({
  categoryId: z.coerce
    .number({ required_error: 'Category is required' })
    .min(1, 'Category is required'),
    
  limitAmount: z.coerce
    .number({ required_error: 'Limit amount is required' })
    .positive('Limit must be greater than 0'),
});

export type BudgetFormValues = z.infer<typeof budgetSchema>;

// ─── Goal ───────────────────────────────────────────────────────────────────────

export const goalSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  
  description: z.string().max(255, 'Description too long').optional(),
  
  targetAmount: z.coerce
    .number({ required_error: 'Target amount is required' })
    .positive('Target must be greater than 0'),
    
  currentAmount: z.coerce
    .number()
    .min(0, 'Current amount cannot be negative')
    .default(0),
    
  deadline: z.string().min(1, 'Deadline is required'),
  
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export type GoalFormValues = z.infer<typeof goalSchema>;

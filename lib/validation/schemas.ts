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
    .positive('Amount must be greater than 0')
    .max(1_000_000, 'Amount cannot exceed 1,000,000')
    .refine(v => Math.round(v * 100) / 100 === v || String(v).split('.')[1]?.length <= 2,
      'Amount can have at most 2 decimal places'),

  date: z.string()
    .min(1, 'Date is required')
    .refine(d => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
      const parsed = new Date(d + 'T00:00:00Z');
      return !isNaN(parsed.getTime());
    }, 'Invalid date')
    .refine(d => {
      // Expense date must be today — not past, not future
      const parsed = new Date(d + 'T00:00:00Z');
      const today  = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      return d === todayStr;
    }, 'Expense date must be today'),

  description: z.string().max(255, 'Description too long').optional(),

  // categoryId is optional — user may choose "Auto Detect" instead
  categoryId: z.coerce.number().min(1).optional(),

  // Free-text category — used when categoryId is absent (auto-detect or custom)
  categoryName: z.string().max(100).optional(),
}).refine(
  (d) => d.categoryId != null || (d.categoryName != null && d.categoryName.trim().length > 0),
  { message: 'Please select a category or use Auto Detect', path: ['categoryId'] },
);

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
  title: z.string().min(3, 'Title is required').max(100),
  
  description: z.string().min(1, 'Description is required').max(500),
  
  targetAmount: z.coerce
    .number({ required_error: 'Target amount is required' })
    .positive('Target must be greater than 0'),
    
  savedAmount: z.coerce
    .number()
    .min(0, 'Current amount cannot be negative')
    .default(0),
    
  deadline: z.string()
    .min(1, 'Deadline is required')
    .refine(d => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
      const parsed = new Date(d + 'T00:00:00Z');
      const today  = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return parsed >= today;
    }, 'Goal deadline cannot be in the past'),
  
  priority: z.enum(['low', 'medium', 'high']),
  
  goalType: z.enum(['short_term', 'long_term']).default('short_term'),
});

export type GoalFormValues = z.infer<typeof goalSchema>;

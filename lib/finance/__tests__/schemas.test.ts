import { expect, test, describe } from 'vitest';
import { CanonicalExpenseSchema, CreateExpenseInputSchema } from '../validation/schemas';
import { todayIST } from '../dates/timezone';

describe('Financial Validation Schemas (Canonical Expense)', () => {
  const validExpense = {
    userId: '123',
    amountPaise: 1050, // 10.50 INR
    dateISO: todayIST(),
    categoryId: 1,
    merchant: {
      raw: 'Amazon',
      normalized: 'Amazon',
    },
    description: 'Books',
  };

  test('Accepts a valid CanonicalExpense', () => {
    const result = CanonicalExpenseSchema.safeParse(validExpense);
    expect(result.success).toBe(true);
  });

  test('Rejects floating point values for amountPaise', () => {
    const invalid = { ...validExpense, amountPaise: 10.50 };
    const result = CanonicalExpenseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('Rejects amounts below minimum limit', () => {
    const invalid = { ...validExpense, amountPaise: 0 };
    const result = CanonicalExpenseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('Rejects future dates', () => {
    // Assuming the year 3000 is always in the future
    const invalid = { ...validExpense, dateISO: '3000-01-01' };
    const result = CanonicalExpenseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('Financial Validation Schemas (Create Input)', () => {
  const validInput = {
    categoryId: 1,
    amountPaise: 1050,
    date: todayIST(),
    merchantName: 'Amazon',
  };

  test('Accepts valid input', () => {
    const result = CreateExpenseInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test('Rejects string amounts (must be converted to paise first)', () => {
    const invalid = { ...validInput, amountPaise: '1050' };
    const result = CreateExpenseInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

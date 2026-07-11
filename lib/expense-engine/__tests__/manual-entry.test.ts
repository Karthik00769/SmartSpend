import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processExpense } from '../index';
import { createExpense } from '@/services/expense.service';
import * as FinanceCore from '../../finance';

// Mock DB
vi.mock('@/services/expense.service', () => ({
  createExpense: vi.fn(async (data) => ({
    id: 'test-exp-123',
    ...data,
  })),
  listExpenses: vi.fn(),
}));

vi.mock('@/services/budget.service', () => ({
  listBudgets: vi.fn(),
}));

// Mock AI
vi.mock('@/lib/ai/expenseCategorizer', () => ({
  callGeminiCategorizer: vi.fn(),
}));

describe('Expense Engine - Manual Entry Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validDate = FinanceCore.Dates.todayIST();

  it('successful pipeline: should process a valid manual expense and set confidence to 100', async () => {
    const raw = {
      userId: 'u1',
      categoryId: 3, // Food
      amount: 150, // 150 INR (float)
      date: validDate,
      description: 'Zomato order',
      source: 'manual' as const,
    };

    const result = await processExpense(raw, 'u1');

    expect(result.validation.valid).toBe(true);
    expect(result.processed.confidenceScore).toBe(100);
    expect(result.processed.needsReview).toBe(false);
    expect(result.categorization.categoryId).toBe(3);

    expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({
      amount: 150, // Float back for DB boundary
      categorySource: 'manual',
    }));
  });

  it('invalid category: should reject manual entry if no categoryId is present', async () => {
    const raw = {
      userId: 'u1',
      amount: 150,
      date: validDate,
      description: 'Unknown expense',
      source: 'manual' as const,
      // No categoryId
    };

    const result = await processExpense(raw, 'u1');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors[0].field).toBe('categoryId');
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('confidence override: should explicitly override even if description matches keyword', async () => {
    const raw = {
      userId: 'u1',
      categoryId: 4,
      amount: 100,
      date: validDate,
      description: 'Netflix', // Usually keywords trigger confidence 80
      source: 'manual' as const,
    };

    const result = await processExpense(raw, 'u1');

    expect(result.processed.confidenceScore).toBe(100);
    expect(result.processed.needsReview).toBe(false);
    expect(result.categorization.confidence).toBe('exact');
  });
});

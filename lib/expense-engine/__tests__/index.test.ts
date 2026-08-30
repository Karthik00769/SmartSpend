import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processExpense } from '../index';
import { createExpense } from '@/services/expense.service';
import { todayIST } from '../../finance/dates/timezone';

// Mock DB and AI
vi.mock('@/services/expense.service', () => ({
  createExpense: vi.fn(),
  listExpenses: vi.fn(),
}));

vi.mock('@/services/budget.service', () => ({
  listBudgets: vi.fn(),
}));

// Mock the dynamic import of Gemini
vi.mock('@/lib/ai/expenseCategorizer', () => ({
  callGeminiCategorizer: vi.fn().mockResolvedValue({
    categoryId: 8,
    categoryName: 'Subscriptions',
    confidence: 'ai_high'
  }),
}));

describe('Expense Engine - processExpense', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validDate = todayIST();
  const userId = 'user_123';

  it('successful pipeline: should orchestrate validation, categorization, enrichment, confidence and DB save', async () => {
    vi.mocked(createExpense).mockResolvedValue({ id: 'exp_123', userId, amount: 150.50 } as any);

    const raw = {
      amount: '150.50',
      date: validDate,
      description: 'Netflix subscription',
    };

    const result = await processExpense(raw, userId);

    // Validation
    expect(result.validation.valid).toBe(true);

    // Categorization
    expect(result.categorization.categoryId).toBe(4); // Entertainment due to "Netflix" keyword
    expect(result.categorization.confidence).toBe('keyword');

    // Enrichment & Core logic (Amounts in paise inside engine!)
    expect(result.processed.amount).toBe(15050); 
    expect(result.processed.week).toBeGreaterThan(0);
    expect(result.processed.confidenceScore).toBeDefined();

    // DB Call — engine passes Paise directly to createExpense
    expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      amountPaise: 15050,   // 150.50 INR → 15050 paise
      date: validDate,
      categoryId: 4,
    }));
  });

  it('invalid amount: should return early with validation errors', async () => {
    const raw = { amount: -5, date: validDate, description: 'Test' };
    const result = await processExpense(raw, userId);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors[0].field).toBe('amount');
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('invalid date: should reject future dates', async () => {
    const raw = { amount: 100, date: '2100-01-01', description: 'Future' };
    const result = await processExpense(raw, userId);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors[0].field).toBe('date');
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('invalid description (merchant representation): should catch long descriptions', async () => {
    const raw = { amount: 100, date: validDate, description: 'a'.repeat(600) };
    const result = await processExpense(raw, userId);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors[0].field).toBe('description');
  });

  it('category assignment: fallback triggers AI categorizer', async () => {
    vi.mocked(createExpense).mockResolvedValue({ id: 'exp_123', userId, amount: 50 } as any);

    const raw = { amount: 50, date: validDate, description: 'Some mysterious charge' };
    const result = await processExpense(raw, userId);

    // Should use the mocked AI result
    expect(result.categorization.confidence).toBe('ai_high');
    expect(result.categorization.categoryId).toBe(8);
  });

  it('duplicate expense / DB failure: should bubble up correctly if DB throws', async () => {
    vi.mocked(createExpense).mockRejectedValue(new Error('DuplicateEntry'));

    const raw = { amount: 100, date: validDate, description: 'Duplicate' };
    await expect(processExpense(raw, userId)).rejects.toThrow('DuplicateEntry');
  });
});

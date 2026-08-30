/**
 * lib/ocr/__tests__/adapter.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full adapter coverage:
 *  - Valid receipt import
 *  - Malformed amount (skipped)
 *  - Malformed date (skipped)
 *  - Validation failure from ExpenseEngine (skipped)
 *  - Duplicate detection (skipped)
 *  - ExpenseEngine rejection / throw (skipped, batch continues)
 *  - Partial success across mixed rows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importReceiptRows } from '../adapter';
import type { RawReceipt } from '../types';

// ── Mock processExpense ────────────────────────────────────────────────────────
vi.mock('@/lib/expense-engine', () => ({
  processExpense: vi.fn(),
}));

// ── Mock services (expense-engine transitive deps) ────────────────────────────
vi.mock('@/services/expense.service', () => ({
  createExpense: vi.fn(async (data) => ({ id: 'test-id', ...data })),
  listExpenses:  vi.fn(async () => []),
}));

vi.mock('@/services/budget.service', () => ({
  listBudgets: vi.fn(async () => ({ categories: [], totalAllocatedPaise: 0 })),
}));

vi.mock('@/lib/ai/expenseCategorizer', () => ({
  callGeminiCategorizer: vi.fn(),
}));

import { processExpense } from '@/lib/expense-engine';

const USER_ID = 'user-ocr-test';

function makeRow(overrides: Partial<RawReceipt> = {}): RawReceipt {
  return {
    merchantRaw: 'STARBUCKS',
    amountRaw:   '350.00',
    dateRaw:     '15/05/2026',
    upiRaw:      '',
    gstRaw:      '',
    items:       [],
    taxRaw:      '',
    totalRaw:    '350.00',
    ...overrides,
  };
}

describe('OCR Adapter — importReceiptRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(processExpense).mockResolvedValue({
      processed:      { amount: 35000, confidenceScore: 80, needsReview: true } as any,
      validation:     { valid: true, errors: [] },
      categorization: { categoryId: 1, categoryName: 'Food', confidence: 'keyword' },
    });
  });

  // ── 1. Valid receipt ────────────────────────────────────────────────────────
  it('imports a valid receipt row successfully', async () => {
    const result = await importReceiptRows([makeRow()], { userId: USER_ID });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(processExpense).toHaveBeenCalledOnce();
  });

  // ── 2. Malformed amount ─────────────────────────────────────────────────────
  it('skips a row with unparseable amount', async () => {
    const result = await importReceiptRows(
      [makeRow({ amountRaw: 'INVALID_AMOUNT' })],
      { userId: USER_ID },
    );

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].reason).toMatch(/Invalid amount/);
    expect(processExpense).not.toHaveBeenCalled();
  });

  // ── 3. Malformed date ───────────────────────────────────────────────────────
  it('skips a row with unparseable date', async () => {
    const result = await importReceiptRows(
      [makeRow({ dateRaw: 'not-a-date-at-all-xyz' })],
      { userId: USER_ID },
    );

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].reason).toMatch(/Could not parse date/);
    expect(processExpense).not.toHaveBeenCalled();
  });

  // ── 4. ExpenseEngine validation failure ─────────────────────────────────────
  it('skips a row when ExpenseEngine throws a validation error', async () => {
    vi.mocked(processExpense).mockRejectedValueOnce(new Error('ValidationError: amount too large'));

    const result = await importReceiptRows([makeRow()], { userId: USER_ID });

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].reason).toContain('ValidationError');
  });

  // ── 5. Duplicate detection ──────────────────────────────────────────────────
  it('skips a duplicate receipt (same merchant, amount, date)', async () => {
    const existing = [{
      merchant:    'STARBUCKS',
      amountPaise: 35000,   // 350.00 INR = 35000 paise
      date:        '2026-05-15',
    }];

    const result = await importReceiptRows(
      [makeRow()],
      { userId: USER_ID, existingReceipts: existing },
    );

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.skipped).toBe(1);
    expect(processExpense).not.toHaveBeenCalled();
  });

  // ── 6. Intra-batch duplicate detection ─────────────────────────────────────
  it('prevents duplicate imports within the same batch', async () => {
    const rows = [makeRow(), makeRow()]; // identical rows

    const result = await importReceiptRows(rows, { userId: USER_ID });

    // First row imports, second is detected as duplicate
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.skipped).toBe(1);
    expect(processExpense).toHaveBeenCalledOnce();
  });

  // ── 7. Partial success ─────────────────────────────────────────────────────
  it('imports valid rows and skips invalid ones in a mixed batch', async () => {
    const rows: RawReceipt[] = [
      makeRow({ merchantRaw: 'AMAZON',    amountRaw: '1200.00', dateRaw: '01/08/2026' }),
      makeRow({ merchantRaw: 'UBER',      amountRaw: 'GARBAGE', dateRaw: '02/08/2026' }), // bad amount
      makeRow({ merchantRaw: 'SWIGGY',    amountRaw: '450.00',  dateRaw: 'NOT A DATE' }), // bad date
      makeRow({ merchantRaw: 'ZOMATO',    amountRaw: '320.00',  dateRaw: '04/08/2026' }),
    ];

    const result = await importReceiptRows(rows, { userId: USER_ID });

    expect(result.imported).toBe(2);   // AMAZON + ZOMATO
    expect(result.skipped).toBe(2);    // UBER + SWIGGY
    expect(result.errors).toHaveLength(2);
    expect(processExpense).toHaveBeenCalledTimes(2);
  });

  // ── 8. Amount tolerance window ─────────────────────────────────────────────
  it('does not flag as duplicate when amount exceeds tolerance', async () => {
    const existing = [{
      merchant:    'STARBUCKS',
      amountPaise: 34000,  // 340 INR — 10 INR = 1000p difference from incoming 35000p
      date:        '2026-05-15',
    }];

    const result = await importReceiptRows(
      [makeRow()],                                   // 350 INR = 35000p
      { userId: USER_ID, existingReceipts: existing, amountTolerancePaise: 500 },
      // tolerance = 500p = ₹5, delta = 1000p — should NOT be duplicate
    );

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(0);
  });
});

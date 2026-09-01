import { describe, it, expect, beforeEach } from 'vitest';
import * as FinanceCore from '../lib/finance';
import { importBankTransactions } from '../lib/bank/adapter';
import { processExpense } from '../lib/expense-engine';
import { RawBankTransaction } from '../lib/bank/types';

// Mock dependencies
import { vi } from 'vitest';

vi.mock('../lib/expense-engine', () => ({
  processExpense: vi.fn(),
}));

describe('Bank Import Hardening', () => {
  const processExpenseMock = processExpense as any;

  beforeEach(() => {
    vi.resetAllMocks();
    processExpenseMock.mockResolvedValue({
      validation: { valid: true, errors: [] },
    });
  });

  it('should parse valid bank transactions', async () => {
    const txs: RawBankTransaction[] = [
      {
        dateRaw: '01/09/2026',
        amountRaw: '1,234.50',
        merchantRaw: 'Amazon',
        referenceRaw: 'Ref123',
        balanceRaw: ''
      },
      {
        dateRaw: '1 Sep 2026',
        amountRaw: '1234',
        merchantRaw: 'Flipkart',
        referenceRaw: 'Ref456',
        balanceRaw: ''
      },
      {
        dateRaw: '2026-09-01',
        amountRaw: '1234.50',
        merchantRaw: 'Swiggy',
        referenceRaw: 'Ref789',
        balanceRaw: ''
      },
    ];

    const result = await importBankTransactions(txs, 'user-1');
    expect(result.importedCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    expect(processExpenseMock).toHaveBeenCalledTimes(3);

    expect(processExpenseMock).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      categoryId: undefined,
      amountPaise: 123450,
      date: '2026-09-01',
      description: 'Ref123',
      source: 'bank_import',
    }, 'user-1');

    expect(processExpenseMock).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      categoryId: undefined,
      amountPaise: 123400,
      date: '2026-09-01',
      description: 'Ref456',
      source: 'bank_import',
    }, 'user-1');

    expect(processExpenseMock).toHaveBeenNthCalledWith(3, {
      userId: 'user-1',
      categoryId: undefined,
      amountPaise: 123450,
      date: '2026-09-01',
      description: 'Ref789',
      source: 'bank_import',
    }, 'user-1');
  });

  it('should skip transactions with invalid date', async () => {
    const txs: RawBankTransaction[] = [
      {
        dateRaw: 'invalid-date',
        amountRaw: '1,234.50',
        merchantRaw: 'Amazon',
        referenceRaw: 'Ref123',
        balanceRaw: ''
      },
    ];

    const result = await importBankTransactions(txs, 'user-1');
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(processExpenseMock).not.toHaveBeenCalled();
    expect(result.skippedRows[0].reason).toBe('Invalid or missing date');
  });

  it('should skip transactions with invalid amount', async () => {
    const txs: RawBankTransaction[] = [
      {
        dateRaw: '2026-09-01',
        amountRaw: '0.50', // less than minimum amount (1 INR)
        merchantRaw: 'Amazon',
        referenceRaw: 'Ref123',
        balanceRaw: ''
      },
      {
        dateRaw: '2026-09-01',
        amountRaw: '1000000000', // exceeds MAX_AMOUNT_INR (10 Crores)
        merchantRaw: 'Amazon',
        referenceRaw: 'Ref123',
        balanceRaw: ''
      }
    ];

    const result = await importBankTransactions(txs, 'user-1');
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(2);
    expect(processExpenseMock).not.toHaveBeenCalled();
  });

  it('should handle engine validation failures', async () => {
    processExpenseMock.mockResolvedValueOnce({
      validation: { valid: false, errors: [{ field: 'amountPaise', message: 'Invalid amount' }] },
    });

    const txs: RawBankTransaction[] = [
      {
        dateRaw: '01/09/2026',
        amountRaw: '1,234.50',
        merchantRaw: 'Amazon',
        referenceRaw: 'Ref123',
        balanceRaw: ''
      },
    ];

    const result = await importBankTransactions(txs, 'user-1');
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedRows[0].reason).toBe('Invalid amount');
  });
  
  // Create 20 variations of inputs
  for (let i = 0; i < 20; i++) {
    it(`should process variation ${i}`, async () => {
      const txs: RawBankTransaction[] = [
        {
          dateRaw: '01/09/2026',
          amountRaw: `${100 + i}`,
          merchantRaw: `Shop ${i}`,
          referenceRaw: `Ref${i}`,
          balanceRaw: ''
        },
      ];

      const result = await importBankTransactions(txs, 'user-1');
      if (result.skippedCount > 0) {
        throw new Error(`Skipped reason: ${result.skippedRows[0].reason}`);
      }
      expect(result.importedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
    });
  }
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importBankTransactions } from '../adapter';
import { RawBankTransaction } from '../types';

// Mock dependencies
vi.mock('../../finance', () => {
  return {
    Parsing: {
      extractAmount: vi.fn((raw: string) => {
        if (raw === 'INVALID') return 0;
        const val = parseFloat(raw.replace(/[^\d.-]/g, ''));
        return isNaN(val) ? 0 : val;
      }),
      extractDate: vi.fn((raw: string) => (raw === 'INVALID_DATE' ? undefined : '2024-01-01')),
      sanitizeMerchantName: vi.fn((raw: string) => raw.trim()),
    },
    Math: {
      inrToPaise: vi.fn((inr: number) => Math.round(inr * 100)),
    },
    Validation: {
      CreateExpenseInputSchema: {
        safeParse: vi.fn((input: any) => {
          if (input.amountPaise < 100) {
            return {
              success: false,
              error: { errors: [{ message: 'Amount must be at least ₹1' }] }
            };
          }
          return { success: true, data: input };
        })
      }
    }
  };
});

vi.mock('../../expense-engine', () => {
  return {
    processExpense: vi.fn(async (input: any) => {
      if (input.description === 'ENGINE_FAIL') {
        return { validation: { valid: false, errors: [{ message: 'Engine rejection' }] } };
      }
      return { validation: { valid: true }, processed: {} };
    })
  };
});

describe('Bank Adapter - importBankTransactions', () => {
  const userId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully import valid transactions', async () => {
    const rawTxns: RawBankTransaction[] = [
      { dateRaw: '01/01/2024', merchantRaw: 'Amazon', amountRaw: '500.00', referenceRaw: '', balanceRaw: '' },
      { dateRaw: '02/01/2024', merchantRaw: 'Netflix', amountRaw: '199.00', referenceRaw: '', balanceRaw: '' }
    ];

    const result = await importBankTransactions(rawTxns, userId);

    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.skippedRows.length).toBe(0);
  });

  it('should skip rows with invalid dates', async () => {
    const rawTxns: RawBankTransaction[] = [
      { dateRaw: 'INVALID_DATE', merchantRaw: 'Amazon', amountRaw: '500.00', referenceRaw: '', balanceRaw: '' }
    ];

    const result = await importBankTransactions(rawTxns, userId);

    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedRows[0].reason).toContain('Invalid or missing date');
  });

  it('should skip rows that fail FinanceCore validation (e.g. amount < 1)', async () => {
    const rawTxns: RawBankTransaction[] = [
      { dateRaw: '01/01/2024', merchantRaw: 'Amazon', amountRaw: '0.00', referenceRaw: '', balanceRaw: '' } // parsed as 0 paise
    ];

    const result = await importBankTransactions(rawTxns, userId);

    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedRows[0].reason).toContain('Amount must be at least');
  });

  it('should skip rows that fail Expense Engine validation', async () => {
    const rawTxns: RawBankTransaction[] = [
      { dateRaw: '01/01/2024', merchantRaw: 'ENGINE_FAIL', amountRaw: '500.00', referenceRaw: 'ENGINE_FAIL', balanceRaw: '' }
    ];

    const result = await importBankTransactions(rawTxns, userId);

    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedRows[0].reason).toContain('Engine rejection');
  });

  it('should handle a mix of valid and invalid rows', async () => {
    const rawTxns: RawBankTransaction[] = [
      { dateRaw: '01/01/2024', merchantRaw: 'Amazon', amountRaw: '500.00', referenceRaw: '', balanceRaw: '' },
      { dateRaw: 'INVALID_DATE', merchantRaw: 'Netflix', amountRaw: '199.00', referenceRaw: '', balanceRaw: '' },
      { dateRaw: '02/01/2024', merchantRaw: 'Uber', amountRaw: '0.50', referenceRaw: '', balanceRaw: '' }, // fails validation
    ];

    const result = await importBankTransactions(rawTxns, userId);

    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(2);
  });
});

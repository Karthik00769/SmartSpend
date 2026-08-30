import { describe, it, expect, vi } from 'vitest';
import { processBankStatement } from '../index';
import { UnsupportedBankFormatError } from '../types/errors';

vi.mock('@/services/expense.service', () => ({}));
vi.mock('@/services/budget.service', () => ({}));

describe('Bank Statement Pipeline', () => {
  it('should process CSV end-to-end and calculate confidence', async () => {
    const raw = `Date,Narration,Withdrawal,Deposit,Balance\n15/07/2026,AMAZON,400,,10000\n16/07/2026,SALARY,,5000,15000`;
    
    const result = await processBankStatement(Buffer.from(''), raw, { fileType: 'csv' });
    
    expect(result.metadata.transactions.length).toBe(2);
    expect(result.metadata.transactions[0].merchantRaw).toBe('AMAZON');
    expect(result.metadata.transactions[1].amountRaw).toBe('+5000');
    expect(result.metadata.confidence).toBeGreaterThan(0);
    expect(result.needsReview).toBe(false); // Confidence should be high
  });

  it('should process simulated PDF end-to-end', async () => {
    // The mocked PDF returns: Date Description Debit Credit Balance
    // 15/07/2026 SWIGGY UPI/123456 350.00  15230.50
    const result = await processBankStatement(Buffer.from('mock'), '', { fileType: 'pdf' });
    
    expect(result.metadata.transactions.length).toBe(2);
    expect(result.metadata.transactions[0].merchantRaw).toBe('SWIGGY');
    expect(result.metadata.transactions[0].referenceRaw).toBe('UPI/123456');
    expect(result.metadata.transactions[0].amountRaw).toBe('350.00');
  });

  it('should throw on unsupported file type', async () => {
    await expect(processBankStatement(Buffer.from(''), '', { fileType: 'excel' as any }))
      .rejects.toThrow(UnsupportedBankFormatError);
  });
});

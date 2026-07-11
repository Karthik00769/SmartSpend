import { describe, it, expect } from 'vitest';
import { parseRawReceipt } from '../parser/receipt';
import { calculateConfidence } from '../confidence/scorer';

describe('Deterministic OCR Parser', () => {
  it('extracts pure strings without financial validation', () => {
    const rawText = `
      STARBUCKS STORE #1234
      15/05/2026
      Latte 250.00
      Cookie 100.00
      Total Rs. 350.00
    `;
    
    const parsed = parseRawReceipt(rawText);
    
    expect(parsed.amountRaw).toBe('350.00'); // Note: It is a string
    expect(parsed.dateRaw).toBe('15/05/2026');
    expect(parsed.merchantRaw).toBe('STARBUCKS STORE #1234');
  });

  it('ignores false positive totals like tax and items', () => {
    const rawText = `
      BIG BAZAAR
      20-08-2024
      Item Total 1500.00
      CGST 9.00
      SGST 9.00
      Net Payable 1518.00
    `;
    
    const parsed = parseRawReceipt(rawText);
    
    expect(parsed.amountRaw).toBe('1518.00');
  });

  it('handles OCR typos without throwing validation errors', () => {
    // OCR often misreads O as 0 and l as 1
    const rawText = `
      AMAZ0N IND1A
      Date: l5/05/2026
      Total: Rs. l2O.5O
    `;
    
    const parsed = parseRawReceipt(rawText);
    
    expect(parsed.amountRaw).toBe('120.50');
    expect(parsed.dateRaw).toBe('15/05/2026');
  });

  it('computes confidence deterministically based on string properties', () => {
    const parsed = {
      merchantRaw: 'UBER RIDES',
      amountRaw: '450.00',
      dateRaw: '12-05-2026',
      upiRaw: '',
      gstRaw: '',
      items: [],
      taxRaw: '',
      totalRaw: ''
    };

    const confidence = calculateConfidence(parsed);
    
    expect(confidence.amount).toBe(95); // Perfect decimal format
    expect(confidence.merchant).toBe(90); // Only letters, > 5 chars
    expect(confidence.date).toBe(90); // valid looking date string
    expect(confidence.overall).toBeGreaterThan(80);
  });
});

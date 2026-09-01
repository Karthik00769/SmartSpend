import { describe, it, expect } from 'vitest';
import * as FinanceCore from '../lib/finance';

describe('OCR Hardening - extractAmount (Canonical Paise)', () => {
  const cases = [
    { input: 'Total: ₹1,234.50', expected: 123450 },
    { input: 'AMOUNT Rs 1234', expected: 123400 },
    { input: 'INR 1234.50', expected: 123450 },
    { input: '1,234.50', expected: 123450 },
    { input: '1234', expected: 123400 },
    // OCR artifacts
    { input: 'Total: 1,234.S0', expected: 123450 }, // S -> 5
    { input: 'Total: l,234.50', expected: 123450 }, // l -> 1
    { input: 'Total: I,234.50', expected: 123450 }, // I -> 1
    { input: 'Total: 1,234.5O', expected: 123450 }, // O -> 0
    { input: 'Total: B,234.50', expected: 823450 }, // B -> 8
    { input: 'Total: 8,234.SO', expected: 823450 },
  ];

  for (const c of cases) {
    it(`should parse OCR amount ${c.input} as ${c.expected} paise`, () => {
      const inr = FinanceCore.Parsing.extractAmount(c.input);
      const paise = FinanceCore.Math.inrToPaise(inr);
      expect(paise).toBe(c.expected);
    });
  }
});

describe('OCR Hardening - extractDate', () => {
  const cases = [
    { input: 'Date: 01/09/2026', expected: '2026-09-01' },
    { input: 'Date: 1 Sep 2026', expected: '2026-09-01' },
    { input: 'Date: 2026-09-01', expected: '2026-09-01' },
    { input: 'Date: 01-Sep-26', expected: '2026-09-01' },
    // more variations
    { input: 'Date: 02/09/2026', expected: '2026-09-02' },
    { input: 'Date: 2 Sep 2026', expected: '2026-09-02' },
    { input: 'Date: 2026-09-02', expected: '2026-09-02' },
    { input: 'Date: 02-Sep-26', expected: '2026-09-02' },
    { input: 'Date: 10/10/2026', expected: '2026-10-10' },
    { input: 'Date: 10 Oct 2026', expected: '2026-10-10' },
    { input: 'Date: 2026-10-10', expected: '2026-10-10' },
    { input: 'Date: 10-Oct-26', expected: '2026-10-10' },
    { input: 'Date: 31/12/2026', expected: '2026-12-31' },
    { input: 'Date: 31 Dec 2026', expected: '2026-12-31' },
    { input: 'Date: 2026-12-31', expected: '2026-12-31' },
    { input: 'Date: 31-Dec-26', expected: '2026-12-31' },
  ];

  for (const c of cases) {
    it(`should parse date ${c.input} as ${c.expected}`, () => {
      const date = FinanceCore.Parsing.extractDate(c.input);
      expect(date).toBe(c.expected);
    });
  }
});

describe('OCR Hardening - sanitizeMerchantName', () => {
  const cases = [
    { input: 'MERCHANT: SWIGGY123', expected: 'SWIGGY123' },
    { input: 'ZOMATO - Mumbai', expected: 'ZOMATO - Mumbai' },
    { input: 'DMART \n Mumbai', expected: 'DMART Mumbai' },
    { input: '  RELIANCE  FRESH  ', expected: 'RELIANCE FRESH' },
    { input: 'STARBUCKS COFFEE', expected: 'STARBUCKS COFFEE' },
    { input: 'MERCHANT: SWIGGY', expected: 'SWIGGY' },
    { input: 'MERCHANT ZOMATO', expected: 'ZOMATO' },
    { input: 'MERCHANT: DMART', expected: 'DMART' },
    { input: 'MERCHANT: RELIANCE', expected: 'RELIANCE' },
    { input: 'MERCHANT: STARBUCKS', expected: 'STARBUCKS' },
  ];

  for (const c of cases) {
    it(`should sanitize merchant ${c.input} as ${c.expected}`, () => {
      const merchant = FinanceCore.Parsing.sanitizeMerchantName(c.input);
      expect(merchant).toBe(c.expected);
    });
  }
});

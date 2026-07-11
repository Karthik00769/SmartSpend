import { describe, it, expect } from 'vitest';
import { parseCSVGrid } from '../parser/statement';

describe('Statement Parser', () => {
  it('should parse raw grid into string structures based on dynamic column mapping', () => {
    const grid = [
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'], // Header
      ['15/07/2026', 'AMAZON', '400', '', '10000'],
      ['16/07/2026', 'SALARY', '', '5000', '15000'],
      ['', 'Skipped Empty Date Line', '', '', '']
    ];

    const txns = parseCSVGrid(grid);
    
    // Only two lines should be parsed (third line skipped due to empty date)
    expect(txns.length).toBe(2);

    expect(txns[0].dateRaw).toBe('15/07/2026');
    expect(txns[0].amountRaw).toBe('400');
    expect(txns[0].merchantRaw).toBe('AMAZON');
    expect(txns[0].referenceRaw).toBe('');
    
    expect(txns[1].dateRaw).toBe('16/07/2026');
    expect(txns[1].amountRaw).toBe('+5000'); // Credit was identified and a + sign added to the string
    expect(txns[1].merchantRaw).toBe('SALARY');
  });

  it('should handle HDFC style [Date, Narration, Withdrawal, Deposit] layouts', () => {
    const grid = [
      ['Date', 'Narration', 'Chq/Ref No.', 'Withdrawal', 'Deposit', 'Closing Balance'],
      ['10/01/2026', 'UPI/SWIGGY', 'UPI123', '250', '', '1500'],
    ];

    const txns = parseCSVGrid(grid);
    expect(txns.length).toBe(1);
    expect(txns[0].merchantRaw).toBe('UPI/SWIGGY');
    expect(txns[0].referenceRaw).toBe('UPI123');
    expect(txns[0].amountRaw).toBe('250');
  });
});

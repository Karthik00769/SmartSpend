import { describe, it, expect } from 'vitest';
import { extractCSVRows } from '../extractor/csv';
import { extractPDFLines } from '../extractor/pdf';
import { EncryptedPDFError } from '../types/errors';

describe('CSV Extractor', () => {
  it('should extract standard comma-separated lines without validation', () => {
    const raw = `Date,Description,Debit,Credit,Balance\n15/07/2026,SWIGGY,350,,15000\n16/07/2026,ZOMATO,200,,14800`;
    const rows = extractCSVRows(raw);
    expect(rows.length).toBe(3);
    expect(rows[1][1]).toBe('SWIGGY');
  });

  it('should handle quoted columns', () => {
    const raw = `Date,Description,Amount\n15/07/2026,"AMAZON, INC",400`;
    const rows = extractCSVRows(raw);
    expect(rows[1][1]).toBe('AMAZON, INC');
    expect(rows[1][2]).toBe('400');
  });
});

describe('PDF Extractor', () => {
  it('should simulate PDF text extraction', async () => {
    const buf = Buffer.from('mock');
    const lines = await extractPDFLines(buf);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should throw EncryptedPDFError when simulated password fails', async () => {
    const buf = Buffer.from('mock');
    await expect(extractPDFLines(buf, 'fail')).rejects.toThrow(EncryptedPDFError);
  });
});

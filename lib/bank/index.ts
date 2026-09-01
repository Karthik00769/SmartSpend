import { extractCSVRows } from './extractor/csv';
import { extractPDFLines } from './extractor/pdf';
import { extractExcelRows } from './extractor/excel';
import { parseCSVGrid } from './parser/statement';
import { calculateStatementConfidence } from './confidence/scorer';
import { extractBankName, extractAccountMask } from './utils';
import { BankStatementExtraction } from './types';
import { UnsupportedBankFormatError } from './types/errors';

export * from './adapter';
export interface ParseOptions {
  fileName?: string;
  password?: string;
  fileType: 'csv' | 'pdf' | 'excel';
}

/**
 * processBankStatement
 * Main entry point for strictly deterministic bank statement extraction.
 * NO validation, NO categorized logic, NO database writes.
 */
export async function processBankStatement(buffer: Buffer, textContent: string, options: ParseOptions): Promise<BankStatementExtraction> {
  let rows: string[][] = [];
  
  if (options.fileType === 'csv') {
    rows = extractCSVRows(textContent);
  } else if (options.fileType === 'pdf') {
    const lines = await extractPDFLines(buffer, options.password);
    // For a highly structured PDF, we simulate it as single-column CSV rows 
    // or we split lines by multi-spaces to map to grids.
    rows = lines.map(line => line.split(/\s{2,}/)); 
  } else if (options.fileType === 'excel') {
    rows = extractExcelRows(buffer);
  } else {
    throw new UnsupportedBankFormatError();
  }

  const transactions = parseCSVGrid(rows);
  const confidence = calculateStatementConfidence(transactions);

  // Attempt to extract metadata cleanly from the first 20 rows of text
  const headerSample = rows.slice(0, 20).map(r => r.join(' ')).join('\n');
  const bankName = extractBankName(headerSample);
  const accountMasked = extractAccountMask(headerSample);

  return {
    metadata: {
      bankName,
      statementPeriod: '', // Extracted down the line or via OCR headers
      accountMasked,
      currency: 'INR',
      confidence,
      transactions,
    },
    needsReview: confidence < 70,
    errors: [],
  };
}

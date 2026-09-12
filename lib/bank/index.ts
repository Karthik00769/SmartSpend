import { extractCSVRows } from './extractor/csv';
import { extractPDFLines } from './extractor/pdf';
import { extractExcelRows } from './extractor/excel';
import { parseCSVGrid, parseTextLines } from './parser/statement';
import { calculateStatementConfidence } from './confidence/scorer';
import { extractBankName, extractAccountMask } from './utils';
import { BankStatementExtraction } from './types';
import { UnsupportedBankFormatError } from './types/errors';

export * from './adapter';
export interface ParseOptions {
  fileName?: string;
  password?: string;
  fileType: 'csv' | 'pdf' | 'excel';
  preParsedLines?: string[];
}

/**
 * processBankStatement
 * Main entry point for strictly deterministic bank statement extraction.
 * NO validation, NO categorized logic, NO database writes.
 */
export async function processBankStatement(buffer: Buffer, textContent: string, options: ParseOptions): Promise<BankStatementExtraction> {
  let rows: string[][] = [];
  let transactions: any[] = [];
  let headerSample = '';
  
  if (options.fileType === 'csv') {
    rows = extractCSVRows(textContent);
    console.log("[BANK LINES]", rows.slice(0, 50));
    transactions = parseCSVGrid(rows);
    headerSample = rows.slice(0, 20).map(r => r.join(' ')).join('\n');
  } else if (options.fileType === 'pdf') {
    const lines = options.preParsedLines || await extractPDFLines(buffer, options.password);
    console.log("[BANK LINES]", lines.slice(0, 50));
    transactions = parseTextLines(lines);
    headerSample = lines.slice(0, 20).join('\n');
  } else if (options.fileType === 'excel') {
    rows = extractExcelRows(buffer);
    console.log("[BANK LINES]", rows.slice(0, 50));
    transactions = parseCSVGrid(rows);
    headerSample = rows.slice(0, 20).map(r => r.join(' ')).join('\n');
  } else {
    throw new UnsupportedBankFormatError();
  }

  console.log(
    "[PARSED TRANSACTIONS COUNT]",
    transactions.length
  );
  console.log(
    "[PARSED TRANSACTIONS SAMPLE]",
    transactions.slice(0, 5)
  );

  const confidence = calculateStatementConfidence(transactions);


  // Attempt to extract metadata cleanly from the first 20 rows of text
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

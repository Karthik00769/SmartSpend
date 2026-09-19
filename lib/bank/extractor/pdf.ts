import { extractTextFromPDFOCR } from '../../ocr/pdf-fallback';
import { PdfReader } from 'pdfreader';

const Y_BUCKET_SIZE = 10; // Configurable multiplier for grouping Y coordinates

/**
 * extractPDFLines
 * Extracts text from a digital PDF using native pdfreader.
 * Falls back to Gemini OCR for scanned PDFs or if parsing fails.
 * Returns raw text lines.
 */
export async function extractPDFLines(pdfBuffer: Buffer, password?: string): Promise<string[]> {
  console.log(JSON.stringify({
    component: 'BankStatementParser',
    action: 'native_pdf_extraction_start',
    message: 'Starting native PDF extraction with pdfreader'
  }));

  try {
    const items: any[] = await new Promise((resolve, reject) => {
      const results: any[] = [];
      new PdfReader().parseBuffer(pdfBuffer, (err: any, item: any) => {
        if (err) reject(err);
        else if (!item) resolve(results);
        else if (item.text) results.push(item);
      });
    });

    // 1. Group by Y coordinate (scaled by Y_BUCKET_SIZE to handle baseline jitter)
    const rows = new Map<number, any[]>();
    for (const item of items) {
      if (item.y === undefined || item.x === undefined || !item.text) continue;
      const yBucket = Math.round(item.y * Y_BUCKET_SIZE);
      if (!rows.has(yBucket)) rows.set(yBucket, []);
      rows.get(yBucket)!.push(item);
    }

    // 2. Sort groups by Y ascending (top to bottom)
    const sortedY = Array.from(rows.keys()).sort((a, b) => a - b);
    
    const extractedLines: string[] = [];
    let textLength = 0;

    // 3. Sort items within rows by X ascending (left to right) and join
    for (const y of sortedY) {
      const rowItems = rows.get(y)!;
      rowItems.sort((a: any, b: any) => a.x - b.x);
      
      const rowText = rowItems.map((i: any) => i.text).join(' ').trim();
      if (rowText) {
        extractedLines.push(rowText);
        textLength += rowText.length;
      }
    }
    
    // Quick validation: Check if we have transaction-like rows (Date ... format)
    const dateRegex = /^(\d{2}[-/\s](?:[a-zA-Z]{3}|\d{2})[-/\s]\d{2,4})/;
    const hasTransactionLikeRows = extractedLines.some(line => dateRegex.test(line));

    // Success condition: meaningful text extracted AND transaction-like rows exist
    if (textLength > 100 && extractedLines.length > 5 && hasTransactionLikeRows) {
      console.log(JSON.stringify({
        component: 'BankStatementParser',
        action: 'native_pdf_extraction_success',
        textLength,
        lineCount: extractedLines.length
      }));
      return extractedLines;
    } else {
      console.log(JSON.stringify({
        component: 'BankStatementParser',
        action: 'native_pdf_extraction_insufficient',
        textLength,
        lineCount: extractedLines.length,
        hasTransactionLikeRows,
        message: 'Native PDF extraction returned insufficient or incompatible text. Falling back to OCR.'
      }));
    }
  } catch (err: any) {
    console.log(JSON.stringify({
      component: 'BankStatementParser',
      action: 'native_pdf_extraction_failed',
      error: err?.message || String(err),
      message: 'Native PDF extraction threw an error. Falling back to OCR.'
    }));
  }

  // Fallback trigger condition: native extraction failed or returned insufficient text
  return await extractTextFromPDFOCR(pdfBuffer, password);
}

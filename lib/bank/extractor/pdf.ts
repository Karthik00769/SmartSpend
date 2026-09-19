import { extractTextFromPDFOCR } from '../../ocr/pdf-fallback';
import pdfParse from 'pdf-parse';

/**
 * extractPDFLines
 * Extracts text from a digital PDF using native pdf-parse.
 * Falls back to Gemini OCR for scanned PDFs or if parsing fails.
 * Returns raw text lines.
 */
export async function extractPDFLines(pdfBuffer: Buffer, password?: string): Promise<string[]> {
  console.log(JSON.stringify({
    component: 'BankStatementParser',
    action: 'native_pdf_extraction_start',
    message: 'Starting native PDF extraction'
  }));

  try {
    const data = await pdfParse(pdfBuffer);
    const text = data.text || '';
    const extractedLines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    
    // Success condition: meaningful text extracted
    if (text.length > 100 && extractedLines.length > 5) {
      console.log(JSON.stringify({
        component: 'BankStatementParser',
        action: 'native_pdf_extraction_success',
        textLength: text.length,
        lineCount: extractedLines.length
      }));
      return extractedLines;
    } else {
      console.log(JSON.stringify({
        component: 'BankStatementParser',
        action: 'native_pdf_extraction_insufficient',
        textLength: text.length,
        lineCount: extractedLines.length,
        message: 'Native PDF extraction returned insufficient text. Falling back to OCR.'
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

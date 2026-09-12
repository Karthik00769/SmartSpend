import { EncryptedPDFError } from '../types/errors';
import { extractTextFromPDFOCR } from '../../ocr/pdf-fallback';

/**
 * extractPDFLines
 * Extracts text from a digital PDF using pdf-parse.
 * Falls back gracefully; does NOT use OCR (Tesseract).
 * Returns raw text lines.
 */
export async function extractPDFLines(pdfBuffer: Buffer, password?: string): Promise<string[]> {
  try {
    // pdf-parse must stay as a require (CommonJS module) to avoid ESM issues in Next.js
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFParse } = require('pdf-parse');

    const options: Record<string, any> = { data: pdfBuffer };
    if (password) {
      options.password = password;
    }

    const parse = new PDFParse(options);
    await parse.load();
    const result = await parse.getText();

    if (!result || !result.text || result.text.trim().length < 50) {
      console.log('[Bank Statement Parser] pdf-parse returned empty or suspiciously short text. Falling back to Gemini OCR...');
      return await extractTextFromPDFOCR(pdfBuffer, password);
    }

    // pdf-parse 2.4.5 returns an object with a .text property
    const textStr = typeof result === 'string' ? result : (result.text || '');

    console.log('[Bank Statement Parser] Extracted raw text length:', textStr.length);
    console.log("[BANK RAW TEXT]", textStr.slice(0, 2000));

    // Split on newlines, trim, remove blanks
    return textStr
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter(Boolean);

  } catch (error: any) {
    // pdf-parse throws when the PDF is password-protected or corrupt
    const msg: string = error?.message ?? '';
    if (
      msg.toLowerCase().includes('password') ||
      msg.toLowerCase().includes('encrypted') ||
      msg.toLowerCase().includes('incorrect password')
    ) {
      throw new EncryptedPDFError();
    }
    // For any other error (corrupt PDF, unsupported version, etc.), rethrow
    throw error;
  }
}

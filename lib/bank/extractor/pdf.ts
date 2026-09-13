import { extractTextFromPDFOCR } from '../../ocr/pdf-fallback';

/**
 * extractPDFLines
 * Extracts text from a digital PDF using Gemini native PDF support.
 * Returns raw text lines.
 */
export async function extractPDFLines(pdfBuffer: Buffer, password?: string): Promise<string[]> {
  console.log("[Bank Statement Parser] Using Gemini native PDF extraction");
  
  const lines = await extractTextFromPDFOCR(pdfBuffer, password);
  
  console.log("[Bank Statement Parser] Gemini extraction completed");
  
  return lines;
}

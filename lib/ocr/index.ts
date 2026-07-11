import { extractTextFromImage } from './extractor';
import { parseRawReceipt } from './parser/receipt';
import { calculateConfidence } from './confidence/scorer';
import { OCRResult } from './types';

/**
 * processReceiptImage
 * The strict, deterministic OCR pipeline entry point.
 * Image -> Text -> RawReceipt -> OCRResult
 * NO database writes, NO financial calculations.
 */
export async function processReceiptImage(imageBuffer: Buffer): Promise<OCRResult> {
  // 1. Preprocessing (handled upstream or here before extraction)
  
  // 2. Extraction: Image to Raw String
  const rawText = await extractTextFromImage(imageBuffer);
  
  // 3. Parser: String to RawReceipt (all strings, no numbers)
  const parsed = parseRawReceipt(rawText);
  
  // 4. Confidence: Score the raw string characteristics
  const confidence = calculateConfidence(parsed);
  
  // 5. Always Needs Review (Mandate: OCR never auto-saves)
  return {
    rawText,
    parsed,
    confidence,
    needsReview: true
  };
}

export * from './types';

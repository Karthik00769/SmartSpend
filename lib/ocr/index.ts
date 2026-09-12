import { extractTextFromImage } from './extractor';
import { parseRawReceipt } from './parser/receipt';
import { calculateConfidence } from './confidence/scorer';
import { OCRResult } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * processReceiptImage
 * Primary: Gemini Vision for high accuracy structured extraction.
 * Fallback: Tesseract text extraction.
 */
export async function processReceiptImage(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelCandidates = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
      let jsonStr = '';

      for (const modelName of modelCandidates) {
        try {
          console.log(`[OCR] Attempting Gemini Vision extraction with ${modelName}...`);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: "object" as any,
                properties: {
                  merchant: { type: "string" as any },
                  amount: { type: "number" as any },
                  date: { type: "string" as any },
                  currency: { type: "string" as any },
                  description: { type: "string" as any }
                },
                required: ["merchant", "amount", "date", "currency"]
              }
            }
          });

          const result = await model.generateContent([
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: mimeType,
              },
            },
          ]);

          jsonStr = result.response.text().trim();
          if (jsonStr) break;
        } catch (e: any) {
          console.warn(`[OCR] ${modelName} failed:`, e?.message || e);
        }
      }

      if (jsonStr) {
        console.log('[OCR] Gemini Vision raw result:', jsonStr);
        const parsed = JSON.parse(jsonStr);
        
        // Validate required fields
        if (
          typeof parsed.merchant !== 'string' ||
          typeof parsed.amount !== 'number' ||
          typeof parsed.date !== 'string' ||
          typeof parsed.currency !== 'string'
        ) {
          throw new Error('Gemini Vision output failed schema validation');
        }

        return {
          source: 'gemini',
          extracted: {
            merchant: parsed.merchant,
            amount: parsed.amount,
            date: parsed.date,
            currency: parsed.currency,
            description: parsed.description || parsed.merchant
          },
          needsReview: true
        };
      } else {
        throw new Error('All Gemini Vision models failed');
      }
    } catch (err: any) {
      console.error('[OCR] Gemini Vision extraction failed. Falling back to Tesseract:', err?.message || err);
    }

  }

  console.log('[OCR] Running Tesseract extraction fallback...');
  // 1. Extraction: Image to Raw String
  const rawText = await extractTextFromImage(imageBuffer);
  
  console.log('[OCR] Tesseract raw text result length:', rawText.length);

  // 2. Parser: String to RawReceipt (all strings, no numbers)
  const parsed = parseRawReceipt(rawText);
  
  // 3. Confidence: Score the raw string characteristics
  const confidence = calculateConfidence(parsed);
  
  // 4. Always Needs Review (Mandate: OCR never auto-saves)
  return {
    source: 'tesseract',
    rawText,
    parsed,
    confidence,
    needsReview: true
  };
}

export * from './types';

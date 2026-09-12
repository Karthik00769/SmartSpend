import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * extractTextFromPDFOCR
 * Fallback mechanism for unreadable/scanned PDFs.
 * Uses Gemini Vision's native PDF support to extract text.
 */
export async function extractTextFromPDFOCR(pdfBuffer: Buffer, password?: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured for PDF OCR fallback.');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-pro',
      // We don't use JSON schema here because we just want the raw text
    });

    const prompt = "Extract all text from this PDF exactly as it appears. Preserve the layout, newlines, and structure as much as possible. Do not add any conversational filler, only return the extracted text.";

    console.log('[Bank Statement Parser] Triggering Gemini Vision PDF OCR fallback...');
    const result = await model.generateContent([
      {
        inlineData: {
          data: pdfBuffer.toString('base64'),
          mimeType: 'application/pdf',
        },
      },
      prompt
    ]);

    const rawText = result.response.text();
    
    // Split on newlines, trim, remove blanks
    return rawText
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter(Boolean);

  } catch (error: any) {
    console.error('[Bank Statement Parser] Gemini Vision PDF OCR fallback failed:', error?.message || error);
    throw error;
  }
}

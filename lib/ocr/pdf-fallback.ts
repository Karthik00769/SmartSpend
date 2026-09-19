import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_MODELS } from '@/lib/ai/models';

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

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const prompt = "Extract all text from this PDF exactly as it appears. Preserve the layout, newlines, and structure as much as possible. Do not add any conversational filler, only return the extracted text.";
  
  // Safer retry budget to prevent serverless timeouts
  const MAX_ATTEMPTS = 3;
  const DELAYS = [1000, 3000];
  let attempt = 0;
  
  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const currentModelName = AI_MODELS.GEMINI_FLASH; // Stick to Flash for OCR (speed/cost/quota)
    const model = genAI.getGenerativeModel({ model: currentModelName });
    
    try {
      console.log(JSON.stringify({
        component: 'BankStatementParser',
        action: 'gemini_pdf_ocr_attempt',
        attempt,
        model: currentModelName,
        status: 'pending'
      }));

      // Hard timeout wrapper to prevent hanging requests causing Vercel 504s
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('GEMINI_REQUEST_TIMEOUT')), 10000)
      );

      const fetchPromise = model.generateContent([
        {
          inlineData: {
            data: pdfBuffer.toString('base64'),
            mimeType: 'application/pdf',
          },
        },
        prompt
      ]);

      const result = await Promise.race([fetchPromise, timeoutPromise]) as any;

      const rawText = result.response.text();
      
      console.log(JSON.stringify({
        component: 'BankStatementParser',
        action: 'gemini_pdf_ocr_success',
        attempt,
        model: currentModelName,
        status: 'success'
      }));

      return rawText
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);

    } catch (error: any) {
      const errorMessage = error?.message?.toLowerCase() || '';
      const status = error?.status;
      
      const isRateLimit = status === 429 || errorMessage.includes('429');
      const isUnavailable = status === 503 || errorMessage.includes('503');
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('fetch failed') || errorMessage.includes('network') || error?.message === 'GEMINI_REQUEST_TIMEOUT';
      
      const isRecoverable = isRateLimit || isUnavailable || isTimeout;
      
      console.log(JSON.stringify({
        component: 'BankStatementParser',
        action: 'gemini_pdf_ocr_error',
        attempt,
        status: 'error',
        model: currentModelName,
        error: error?.message || String(error),
        isRecoverable
      }));

      if (isRecoverable && attempt < MAX_ATTEMPTS) {
        const delayMs = DELAYS[attempt - 1] || DELAYS[DELAYS.length - 1];
        console.log(JSON.stringify({
          component: 'BankStatementParser',
          action: 'gemini_pdf_ocr_retry_wait',
          attempt,
          delayMs,
          message: `Retrying after ${delayMs}ms`
        }));
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }
      
      console.error(JSON.stringify({
        component: 'BankStatementParser',
        action: 'gemini_pdf_ocr_fatal',
        attempt,
        error: error?.message || String(error),
        message: 'Exhausted retries or encountered unrecoverable error.'
      }));
      
      throw new Error('Bank statement processing is temporarily unavailable. Please try again later.');
    }
  }
  
  throw new Error('Bank statement processing is temporarily unavailable. Please try again later.');
}

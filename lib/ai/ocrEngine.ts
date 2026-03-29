import { GoogleGenerativeAI } from '@google/generative-ai';

export interface OCRResult {
  amount:      number;
  date:        string;    // YYYY-MM-DD
  description: string;
  category?:   string;
}

/**
 * scanReceipt
 * Uses Gemini 1.5 Flash (Multimodal) to extract structured expense data
 * from a receipt image (Base64).
 */
export async function scanReceipt(base64Image: string, mimeType: string): Promise<OCRResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[OCR] GEMINI_API_KEY missing. OCR disabled.');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });


  const prompt = `
    Extract the total amount, date, and vendor/description from this receipt.
    Return the result strictly as a valid JSON object with the following schema:
    {
      "amount": number,
      "date": "YYYY-MM-DD",
      "description": "Vendor name and brief summary",
      "category": "Optional suggested category (e.g. Food, Transport, Shopping)"
    }
    If the date is missing, use the current date: ${new Date().toISOString().split('T')[0]}.
    Ensure the amount is a raw number (no currency symbols).
  `;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    const responseText = result.response.text();
    const cleaned = responseText.replace(/```json|```/g, '').trim();
    const data: OCRResult = JSON.parse(cleaned);

    return {
      amount:      Number(data.amount),
      date:        data.date || new Date().toISOString().split('T')[0],
      description: data.description || 'Scanned Receipt',
      category:    data.category,
    };
  } catch (error) {
    console.error('[OCR] Extraction failed:', error);
    return null;
  }
}

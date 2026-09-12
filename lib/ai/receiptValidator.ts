import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export interface ValidationResult {
  merchant?: string;
  amount?: number;
  date?: string;
}

const MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

export async function validateOCRWithGemini(
  merchant: string,
  amount: number,
  date: string | undefined,
  rawText: string
): Promise<ValidationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `SYSTEM:

You are a receipt validation AI.

Your job:
* Identify correct merchant name
* Identify correct total amount
* Identify correct date

STRICT RULES:
* Extract ONLY from given text
* Ignore phone numbers, GST, invoice IDs
* Amount must be realistic (₹1 – ₹1,00,000)
* If the OCR raw text doesn't explicitly contain the merchant name, do not make one up.
* Understand regional and global contexts including India, US, Europe, and others. Recognize services like UPI, Swiggy, Zomato, Ola, Uber, Amazon, Flipkart, LIC, etc.

---
USER:

Correct this receipt data. Return:
- merchant
- amount
- date
Only return valid JSON.

Input:
${JSON.stringify({ merchant, amount, date, rawText: rawText.slice(0, 1500) }, null, 2)}

---
OUTPUT FORMAT (STRICT JSON ONLY):
{
  "merchant": "...",
  "amount": 450,
  "date": "2024-01-15"
}`;

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Gemini API timeout')), 10000)
      );

      const result = await Promise.race([
        model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: {
                merchant: {
                  type: SchemaType.STRING,
                  description: 'The extracted merchant name'
                },
                amount: {
                  type: SchemaType.NUMBER,
                  description: 'The extracted total amount'
                },
                date: {
                  type: SchemaType.STRING,
                  description: 'The extracted date in YYYY-MM-DD format'
                }
              },
              required: ['merchant', 'amount', 'date']
            },
            temperature: 0.1,
          },
        }),
        timeoutPromise
      ]) as any;

      let responseText = result.response.text().trim();
      // Remove any leftover markdown
      responseText = responseText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();

      let raw: any = {};
      try {
        raw = JSON.parse(responseText);
      } catch (parseErr) {
        console.warn(`[receiptValidator] JSON parse error on ${modelName}. Output: ${responseText}`);
        continue; // try next model or fallback
      }

      const validatedAmount = typeof raw.amount === 'number' && raw.amount >= 1 && raw.amount <= 100000
        ? raw.amount
        : undefined;
      const validatedMerchant = typeof raw.merchant === 'string' && raw.merchant.trim().length > 0
        ? raw.merchant.trim()
        : undefined;

      const validatedDate = typeof raw.date === 'string' && raw.date.trim().length >= 10
        ? raw.date.trim().slice(0, 10)
        : undefined;

      return {
        merchant: validatedMerchant,
        amount: validatedAmount,
        date: validatedDate,
      };

    } catch (err: any) {
      const is404 = err?.status === 404 || String(err?.message).includes('404') || String(err?.message).includes('not found');
      if (is404) continue;
      console.error(`[receiptValidator] Gemini error with "${modelName}":`, err?.message ?? err);
      break;
    }
  }

  return null;
}

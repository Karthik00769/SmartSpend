import { GoogleGenerativeAI } from '@google/generative-ai';

export type DocumentClassification = 
  | 'Bank Statement' 
  | 'Receipt' 
  | 'Invoice' 
  | 'Payment Acknowledgement' 
  | 'Unknown';

/**
 * classifyDocumentImage
 * Uses Gemini Vision to classify an image or PDF buffer.
 */
export async function classifyDocumentImage(buffer: Buffer, mimeType: string): Promise<DocumentClassification> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 'Unknown';

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object" as any,
          properties: {
            classification: { 
              type: "string" as any,
              enum: ['Bank Statement', 'Receipt', 'Invoice', 'Payment Acknowledgement', 'Unknown']
            }
          },
          required: ["classification"]
        }
      }
    });

    const result = await model.generateContent([
      {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType,
        },
      },
      "Classify this document based on its visual content. Is it a Bank Statement, a Receipt, an Invoice, a Payment Acknowledgement, or Unknown?"
    ]);

    const jsonStr = result.response.text().trim();
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      return parsed.classification as DocumentClassification;
    }
  } catch (err: any) {
    console.error('[CLASSIFIER] Image classification failed:', err?.message || err);
  }
  
  return 'Unknown';
}

/**
 * classifyDocumentText
 * Uses text heuristics to classify text-based PDFs.
 */
export function classifyDocumentText(text: string): DocumentClassification {
  const lowerText = text.toLowerCase();
  
  if (
    lowerText.includes('account statement') || 
    lowerText.includes('bank statement') ||
    lowerText.includes('opening balance') ||
    lowerText.includes('closing balance') ||
    (lowerText.includes('debit') && lowerText.includes('credit') && lowerText.includes('balance'))
  ) {
    return 'Bank Statement';
  }
  
  if (
    lowerText.includes('invoice') || 
    lowerText.includes('bill to') ||
    lowerText.includes('due date') ||
    lowerText.includes('invoice no')
  ) {
    return 'Invoice';
  }
  
  if (
    lowerText.includes('receipt') || 
    lowerText.includes('total paid') ||
    lowerText.includes('payment successful')
  ) {
    return 'Receipt';
  }
  
  if (
    lowerText.includes('acknowledgement') || 
    lowerText.includes('transaction successful') ||
    lowerText.includes('payment received') ||
    lowerText.includes('reference no')
  ) {
    return 'Payment Acknowledgement';
  }

  return 'Unknown';
}

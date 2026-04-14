/**
 * lib/ai/ocrEngine.ts
 * ─────────────────────────────────────────────────────────────────────
 * Receipt extraction using Gemini 1.5 Flash multimodal vision.
 *
 * RULES:
 *  - Zero browser-only APIs (no DOMMatrix, no canvas, no window)
 *  - AI extracts TEXT content only — amounts/dates are parsed by us via regex
 *    so AI never fabricates numbers directly into the DB
 *  - Full logging at every step for debugging
 *  - Returns null on any failure — caller decides how to handle
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Exported result type ─────────────────────────────────────────────────────

export interface OCRResult {
  amount:      number;        // parsed number, 0 if not found
  date:        string;        // YYYY-MM-DD
  merchant:    string;        // vendor / store name
  description: string;        // short summary suitable for display
  raw_text:    string;        // full text returned by Gemini
  confidence:  'high' | 'medium' | 'low';
}

// ─── Regex helpers (pure Node-safe) ──────────────────────────────────────────

/**
 * extractAmount
 * Finds the LARGEST plausible currency amount in a text block.
 * Handles: 1,234.56 | 1234.56 | $45.00 | ₹1200 | 12.5
 */
function extractAmount(text: string): { value: number; confidence: 'high' | 'medium' | 'low' } {
  // Priority 1: "Total" / "Amount Due" / "Grand Total" line
  const totalPatterns = [
    /(?:grand\s*total|total\s*due|amount\s*due|total\s*amount|net\s*amount|balance\s*due)[^\d]*?([\d,]+\.?\d*)/i,
    /(?:total)[^\d]*?([\d,]+\.?\d{2})/i,
  ];
  for (const pat of totalPatterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        console.log(`[OCR] Amount found via Total pattern: ${val}`);
        return { value: val, confidence: 'high' };
      }
    }
  }

  // Priority 2: Scan all currency-formatted numbers, pick the largest (likely the total)
  const allAmounts = text.match(/\b\d{1,6}[.,]\d{2}\b/g);
  if (allAmounts && allAmounts.length > 0) {
    const parsed = allAmounts.map(a => parseFloat(a.replace(/,(?=\d{3})/g, '').replace(',', '.'))).filter(n => !isNaN(n) && n > 0);
    if (parsed.length > 0) {
      const max = Math.max(...parsed);
      console.log(`[OCR] Amount found via max-scan: ${max} (candidates: ${parsed.join(', ')})`);
      return { value: max, confidence: parsed.length === 1 ? 'high' : 'medium' };
    }
  }

  console.log('[OCR] Amount: not found');
  return { value: 0, confidence: 'low' };
}

/**
 * extractDate
 * Tries multiple date formats found in receipts.
 * Returns YYYY-MM-DD or today's date as fallback.
 */
function extractDate(text: string): string {
  const today = new Date().toISOString().split('T')[0];

  // Pattern order: most specific first
  const patterns: RegExp[] = [
    // YYYY-MM-DD or YYYY/MM/DD
    /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
    // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/,
    // DD Mon YYYY  e.g. 15 Jan 2024
    /\b(0?[1-9]|[12]\d|3[01])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/i,
    // Mon DD, YYYY  e.g. Jan 15, 2024
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      try {
        const raw = m[0];
        const d   = new Date(raw);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
          const iso = d.toISOString().split('T')[0];
          console.log(`[OCR] Date found: ${iso} (raw: "${raw}")`);
          return iso;
        }
      } catch {
        // continue to next pattern
      }
    }
  }

  console.log(`[OCR] Date: not found, defaulting to today (${today})`);
  return today;
}

/**
 * extractMerchant
 * Looks for the store/vendor name in the first non-trivial lines of the receipt.
 */
function extractMerchant(text: string): string {
  const skipKeywords = [
    'receipt', 'invoice', 'tax', 'total', 'amount', 'date', 'page',
    'order', 'duplicate', 'customer', 'cashier', 'terminal', 'auth',
    'thank', 'welcome', 'please', 'visit', 'gst', 'vat', 'subtotal',
  ];

  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2 && l.length < 60);

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Skip lines that are mostly numbers
    if (/^\d/.test(line) || /\d{4,}/.test(line)) continue;
    // Skip lines containing common receipt metadata keywords
    if (skipKeywords.some(kw => lower.includes(kw))) continue;
    // Skip lines with currency symbols at start
    if (/^[$₹€£¥]/.test(line)) continue;

    const cleaned = line.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9\s]+$/g, '').trim();
    if (cleaned.length > 2) {
      console.log(`[OCR] Merchant found: "${cleaned}" (line ${i})`);
      return cleaned;
    }
  }

  console.log('[OCR] Merchant: not found');
  return 'Unknown Merchant';
}

// ─── Gemini Vision Extractor ──────────────────────────────────────────────────

/**
 * scanWithGemini
 * Sends a base64-encoded image/PDF to Gemini 1.5 Flash.
 * Asks Gemini to return the RAW TEXT of the receipt — we parse numbers ourselves.
 * AI is ONLY used for text extraction, never for inventing amounts.
 */
export async function scanWithGemini(
  base64Data: string,
  mimeType:   string,
): Promise<OCRResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[OCR] GEMINI_API_KEY is missing. OCR disabled.');
    return null;
  }

  // Validate mime type
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!supportedTypes.includes(mimeType)) {
    console.error(`[OCR] Unsupported MIME type: ${mimeType}`);
    return null;
  }

  console.log(`[OCR] Starting Gemini scan. MIME: ${mimeType}, data length: ${base64Data.length}`);

  const genAI = new GoogleGenerativeAI(apiKey);
  // Use flash for speed — Pro is for complex reasoning
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

  // Prompt asks for raw text representation — NOT for structured extraction
  // This prevents Gemini from inventing numbers.
  const prompt = `
You are an OCR (optical character recognition) system.
Your ONLY task: transcribe ALL visible text from this receipt/document exactly as it appears.
Do NOT interpret, calculate, or summarize. Just output the raw text.
Preserve line breaks. Do not add any commentary or formatting.
`;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data:     base64Data,
          mimeType: mimeType as any,
        },
      },
    ]);

    const rawText = result.response.text().trim();
    console.log(`[OCR] Raw text received (${rawText.length} chars):`);
    console.log('[OCR] ---BEGIN RAW TEXT---');
    console.log(rawText.substring(0, 500)); // log first 500 chars
    console.log('[OCR] ---END RAW TEXT---');

    if (!rawText || rawText.length < 5) {
      console.warn('[OCR] Gemini returned empty or too-short text');
      return null;
    }

    // Now parse using our own deterministic regex — AI never touches numbers directly
    const amountResult = extractAmount(rawText);
    const date         = extractDate(rawText);
    const merchant     = extractMerchant(rawText);

    const extracted: OCRResult = {
      amount:      amountResult.value,
      date,
      merchant,
      description: merchant !== 'Unknown Merchant' ? `${merchant} receipt` : 'Scanned receipt',
      raw_text:    rawText,
      confidence:  amountResult.confidence,
    };

    console.log('[OCR] Final extracted:', {
      amount:     extracted.amount,
      date:       extracted.date,
      merchant:   extracted.merchant,
      confidence: extracted.confidence,
    });

    return extracted;
  } catch (err: any) {
    console.error('[OCR] Gemini call failed:', err?.message || err);
    return null;
  }
}

/**
 * scanReceipt
 * Legacy export alias — kept for backward compatibility.
 * Delegates to scanWithGemini.
 */
export async function scanReceipt(
  base64Image: string,
  mimeType:    string,
): Promise<{ amount: number; date: string; description: string; category?: string } | null> {
  const result = await scanWithGemini(base64Image, mimeType);
  if (!result) return null;
  return {
    amount:      result.amount,
    date:        result.date,
    description: result.description,
  };
}

// ─── Plain-text extractor (CSV / TXT — no AI needed) ─────────────────────────

/**
 * extractFromPlainText
 * For CSV/TXT bank statements. Finds amounts and dates in raw text.
 * Returns the best single transaction (highest amount) as the extracted data.
 */
export function extractFromPlainText(text: string): OCRResult {
  console.log(`[OCR] Plain-text extraction. Length: ${text.length}`);
  console.log('[OCR] First 200 chars:', text.substring(0, 200));

  const amountResult = extractAmount(text);
  const date         = extractDate(text);
  const merchant     = extractMerchant(text);

  const result: OCRResult = {
    amount:      amountResult.value,
    date,
    merchant,
    description: merchant !== 'Unknown Merchant' ? `${merchant} (statement)` : 'Uploaded statement',
    raw_text:    text,
    confidence:  amountResult.confidence,
  };

  console.log('[OCR] Plain-text extracted:', {
    amount:     result.amount,
    date:       result.date,
    merchant:   result.merchant,
    confidence: result.confidence,
  });

  return result;
}

import { RawReceipt } from '../types';
import { cleanOCRText, isJunkLine } from '../utils/cleaner';
import { TOTAL_LINE_PATTERN, FALSE_POSITIVE_PATTERN, RECEIPT_DATE_PATTERNS } from '../constants';

export function extractAmountStringStrict(lines: string[]): string {
  // STRICT PRIORITY 1: Lines containing total, grand total, amount paid
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (TOTAL_LINE_PATTERN.test(line) && !FALSE_POSITIVE_PATTERN.test(line)) {
      const match = line.match(/(?:^|\s)(?:Rs\.?|INR|[\$\£\€\₹])?\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)/i);
      if (match && match[1]) {
        return match[1]; // Return as raw string
      }
    }
  }

  // STRICT PRIORITY 2: Regex currency + decimal
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (FALSE_POSITIVE_PATTERN.test(line) || isJunkLine(line)) continue;
    const currMatch = /(?:[\$\£\€\₹]|Rs\.?|INR|USD)\s*(\d{1,6}(?:\.\d{1,2})?)/gi.exec(line);
    if (currMatch) {
      return currMatch[1];
    }
  }

  // Fallback: Return any valid decimal
  for (const line of lines) {
    if (FALSE_POSITIVE_PATTERN.test(line) || isJunkLine(line)) continue;
    const match = line.match(/\d{1,5}\.\d{2}/g);
    if (match) {
      return match[match.length - 1];
    }
  }

  return '';
}

export function extractMerchantStringStrict(lines: string[]): string {
  const topLines = lines.slice(0, 7);

  interface RankedMerchant { text: string; score: number }
  const candidates: RankedMerchant[] = [];

  for (const line of topLines) {
    if (isJunkLine(line)) continue;

    const cleanLine = line.replace(/^[^a-zA-Z]+/, '').replace(/[^\w\s&',.\-]+$/, '').trim();
    if (cleanLine.length < 3) continue;

    let score = 0;
    if (/^[A-Z\s&',.\-]+$/.test(cleanLine)) score += 30;
    if (cleanLine.split(/\s+/).length > 1) score += 20;
    if (!/\d/.test(cleanLine)) score += 20;

    if (score > 0) {
      candidates.push({ text: cleanLine, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].text.substring(0, 60) : '';
}

export function extractDateString(text: string): string {
  const lines = text.split('\n');
  const sample = [...lines.slice(0, 15), ...lines.slice(-10)];

  for (const line of sample) {
    for (const pattern of RECEIPT_DATE_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        return match[0]; // Return the raw string match without Date parsing
      }
    }
  }

  return '';
}

/**
 * parseRawReceipt
 * Returns a RawReceipt filled entirely with strings. No numbers or Date objects.
 */
export function parseRawReceipt(rawText: string): RawReceipt {
  const text = cleanOCRText(rawText);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const amountRaw = extractAmountStringStrict(lines);
  const dateRaw = extractDateString(text);
  const merchantRaw = extractMerchantStringStrict(lines);

  return {
    merchantRaw,
    amountRaw,
    dateRaw,
    upiRaw: '', // stub for future UPI extraction
    gstRaw: '', // stub for future GST extraction
    items: [],  // stub for line items
    taxRaw: '', // stub for tax separation
    totalRaw: amountRaw, // fallback
  };
}

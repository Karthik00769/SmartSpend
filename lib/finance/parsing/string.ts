/**
 * lib/finance/parsing/string.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilities for cleaning and parsing raw string data (OCR, Bank statements).
 */

import { MAX_MERCHANT_LENGTH } from '../constants/limits';

/**
 * Sanitizes a raw merchant name.
 * Strips special trailing characters, limits length.
 */
export function sanitizeMerchantName(raw: string): string {
  if (!raw) return 'Unknown Merchant';
  
  // Replace multiple spaces and trim
  let clean = raw.replace(/\s+/g, ' ').trim();
  
  // Remove "MERCHANT:" or "MERCHANT" prefix if present
  clean = clean.replace(/^MERCHANT:?\s*/i, '').trim();
  
  // Remove trailing junk common in bank statements e.g. "Merchant Name -", "Merchant #"
  clean = clean.replace(/[-*#]+$/, '').trim();
  
  if (clean.length === 0) return 'Unknown Merchant';
  
  // Truncate to max length
  if (clean.length > MAX_MERCHANT_LENGTH) {
    clean = clean.substring(0, MAX_MERCHANT_LENGTH).trim();
  }
  
  return clean;
}

/**
 * Extracts a UPI ID from a string, if present.
 */
export function extractUPI(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9.\-_]+@[a-zA-Z]{3,}/);
  return match ? match[0].toLowerCase() : undefined;
}

/**
 * Extracts a 15 digit GSTIN from a string, if present.
 */
export function extractGSTIN(text: string): string | undefined {
  const match = text.match(/\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/);
  return match ? match[0].toUpperCase() : undefined;
}

/**
 * Safely extracts a YYYY-MM-DD date from a messy string.
 * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, and JS Date fallbacks.
 */
export function extractDate(raw: string): string | undefined {
  if (!raw) return undefined;
  
  let clean = raw.trim().replace(/^DATE:?\s*/i, '').trim();
  
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmMatch) {
    const d = dmMatch[1].padStart(2, '0');
    const m = dmMatch[2].padStart(2, '0');
    const y = dmMatch[3];
    return `${y}-${m}-${d}`;
  }
  
  // Fallback to JS Date parsing
  // Append UTC to avoid timezone shift on local parsing of strings like "1 Sep 2026"
  const parsed = new Date(clean + ' UTC');
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  
  return undefined;
}

/**
 * Extracts a numeric amount from a messy string.
 * Strips currency symbols, commas, and handles Cr/Dr suffixes.
 * Returns the parsed float (INR). 
 * Debits (expenses) are positive, Credits (income) are negative.
 */
export function extractAmount(raw: string): number {
  if (!raw || !/\d/.test(raw)) return 0;
  
  let clean = raw.trim().toUpperCase();
  const isCredit = clean.includes('CR') || clean.startsWith('+');
  
  // Remove common text prefixes/words BEFORE OCR substitution
  clean = clean.replace(/RS\.?|INR|AMOUNT|TOTAL|NET|PAYMENT|PAID/g, '');
  
  // OCR common misreads for numbers
  clean = clean.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');

  clean = clean.replace(/[^\d.-]/g, '');
  if (!clean) return 0;
  
  let value = parseFloat(clean);
  if (isNaN(value)) return 0;
  
  value = Math.abs(value);
  return isCredit ? -value : value;
}

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

/**
 * lib/finance/formatting/currency.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UI Formatters for Indian Currency.
 */

import { minorToInr } from '../calculations/math';

export const CURRENCY_SYMBOL = '₹';

/**
 * Formats a raw Minor amount into the Indian Numbering System string.
 * Example: 1500000 -> "₹15,000.00"
 * @param amountMinor Amount in Minor
 * @returns Formatted INR string
 */
export function formatINR(amountMinor: number): string {
  const amountInr = minorToInr(amountMinor);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountInr);
  } catch {
    // Fallback if Intl.NumberFormat is constrained
    return `₹${amountInr.toFixed(2)}`;
  }
}

/**
 * Formats a raw Minor amount to an INR string without decimals if they are .00
 * Example: 1500000 -> "₹15,000"
 * @param amountMinor Amount in Minor
 * @returns Formatted INR string
 */
export function formatCompactINR(amountMinor: number): string {
  const amountInr = minorToInr(amountMinor);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: Number.isInteger(amountInr) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amountInr);
  } catch {
    return `₹${amountInr}`;
  }
}

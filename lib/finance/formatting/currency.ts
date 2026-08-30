/**
 * lib/finance/formatting/currency.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UI Formatters for Indian Currency.
 */

import { paiseToInr } from '../calculations/math';

export const CURRENCY_SYMBOL = '₹';

/**
 * Formats a raw Paise amount into the Indian Numbering System string.
 * Example: 1500000 -> "₹15,000.00"
 * @param amountPaise Amount in Paise
 * @returns Formatted INR string
 */
export function formatINR(amountPaise: number): string {
  const amountInr = paiseToInr(amountPaise);
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
 * Formats a raw Paise amount to an INR string without decimals if they are .00
 * Example: 1500000 -> "₹15,000"
 * @param amountPaise Amount in Paise
 * @returns Formatted INR string
 */
export function formatCompactINR(amountPaise: number): string {
  const amountInr = paiseToInr(amountPaise);
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

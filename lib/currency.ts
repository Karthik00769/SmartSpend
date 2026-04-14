/**
 * lib/currency.ts
 * ─────────────────────────────────────────────────────────────────────
 * Currency formatting utilities.
 *
 * Strategy: all values are stored in the user's base currency in the DB.
 * At the UI level we simply format with the correct symbol/locale.
 * No exchange rate conversion — values are already in the user's currency.
 */

export const CURRENCY_META: Record<string, { symbol: string; locale: string; code: string }> = {
  USD: { symbol: '$',  locale: 'en-US', code: 'USD' },
  EUR: { symbol: '€',  locale: 'de-DE', code: 'EUR' },
  GBP: { symbol: '£',  locale: 'en-GB', code: 'GBP' },
  INR: { symbol: '₹',  locale: 'en-IN', code: 'INR' },
  CAD: { symbol: 'CA$', locale: 'en-CA', code: 'CAD' },
  AUD: { symbol: 'A$',  locale: 'en-AU', code: 'AUD' },
  JPY: { symbol: '¥',  locale: 'ja-JP', code: 'JPY' },
  CHF: { symbol: 'Fr', locale: 'de-CH', code: 'CHF' },
};

/**
 * formatCurrency
 * Format a number using the user's currency code.
 * Falls back to USD if the code is unknown.
 */
export function formatCurrency(amount: number, currencyCode: string = 'USD'): string {
  const meta = CURRENCY_META[currencyCode] ?? CURRENCY_META.USD;
  try {
    return new Intl.NumberFormat(meta.locale, {
      style:                 'currency',
      currency:              meta.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for environments where Intl is limited
    return `${meta.symbol}${amount.toFixed(2)}`;
  }
}

/**
 * getCurrencySymbol
 * Returns just the symbol for a currency code.
 */
export function getCurrencySymbol(currencyCode: string = 'USD'): string {
  return (CURRENCY_META[currencyCode] ?? CURRENCY_META.USD).symbol;
}

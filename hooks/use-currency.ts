/**
 * hooks/use-currency.ts
 * ─────────────────────────────────────────────────────────────────────
 * Provides currency formatting and symbol for the UI.
 * Now hardcoded to INR via FinanceCore since the system is canonicalized to Minor.
 */
'use client';

import { useCallback } from 'react';
import { useSession } from 'next-auth/react';

export interface UseCurrencyReturn {
  currency: string;
  symbol:   string;
  fmt:      (amountMinor: number) => string;
  refresh:  () => void;
}

export function refreshCurrency() {
  // Deprecated global function, currency now driven by session
}

export function useCurrency(): UseCurrencyReturn {
  const { data: session, update } = useSession();
  const currencyCode = (session?.user as any)?.currency || 'USD';

  const symbol = (0).toLocaleString('en-US', { style: 'currency', currency: currencyCode }).replace(/[\d.,\s]/g, '').trim();

  const refresh = useCallback(() => {
    update();
  }, [update]);

  const fmt = useCallback(
    (amountMinor: number) => {
       const amountMajor = amountMinor / 100;
       return new Intl.NumberFormat('en-US', {
         style: 'currency',
         currency: currencyCode,
         minimumFractionDigits: 0,
         maximumFractionDigits: 2,
       }).format(amountMajor);
    },
    [currencyCode],
  );

  return { currency: currencyCode, symbol, fmt, refresh };
}

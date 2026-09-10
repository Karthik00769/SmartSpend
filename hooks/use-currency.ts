/**
 * hooks/use-currency.ts
 * ─────────────────────────────────────────────────────────────────────
 * Provides currency formatting and symbol for the UI.
 * Now hardcoded to INR via FinanceCore since the system is canonicalized to Minor.
 */
'use client';

import { useCallback } from 'react';
import { Format } from '@/lib/finance';

export interface UseCurrencyReturn {
  currency: string;
  fmt:      (amountMinor: number) => string;
  refresh:  () => void;
}

export function refreshCurrency() {
  // No-op since currency is statically INR
}

export function useCurrency(): UseCurrencyReturn {
  const refresh = useCallback(() => {}, []);

  const fmt = useCallback(
    (amountMinor: number) => Format.formatINR(amountMinor),
    [],
  );

  return { currency: 'INR', fmt, refresh };
}

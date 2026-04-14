/**
 * hooks/use-currency.ts
 * ─────────────────────────────────────────────────────────────────────
 * Fetches the user's currency preference from /api/settings/profile
 * and returns a formatter function.
 *
 * Re-fetches whenever the session changes OR when manually refreshed
 * (e.g. after settings save).
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession }     from 'next-auth/react';
import { formatCurrency } from '@/lib/currency';

export interface UseCurrencyReturn {
  currency: string;
  fmt:      (amount: number) => string;
  refresh:  () => void;
}

// Module-level tick so any component can trigger a global re-fetch
let _tick = 0;
const _listeners = new Set<() => void>();

export function refreshCurrency() {
  _tick++;
  _listeners.forEach(fn => fn());
}

export function useCurrency(): UseCurrencyReturn {
  const { data: session } = useSession();
  const [currency, setCurrency] = useState('USD');
  const [tick, setTick] = useState(0);

  // Subscribe to global refresh signal
  useEffect(() => {
    const fn = () => setTick(t => t + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/settings/profile')
      .then(r => r.json())
      .then(d => {
        const code = d?.data?.currency ?? d?.currency;
        if (code && typeof code === 'string') setCurrency(code);
      })
      .catch(() => {});
  }, [session, tick]); // re-fetch when tick changes

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const fmt = useCallback(
    (amount: number) => formatCurrency(amount, currency),
    [currency],
  );

  return { currency, fmt, refresh };
}

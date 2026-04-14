/**
 * hooks/use-timezone.ts
 * ─────────────────────────────────────────────────────────────────────
 * Returns the user's stored timezone and timezone-aware date helpers.
 * Defaults to Asia/Kolkata (IST) until the profile loads.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession }                        from 'next-auth/react';
import { todayInTimezone, formatDateTimeInTimezone } from '@/lib/date';

export interface UseTimezoneReturn {
  timezone:  string;
  today:     () => string;                                    // YYYY-MM-DD in user's TZ
  formatDT:  (utcStr: string, showTime?: boolean) => string; // created_at display
}

export function useTimezone(): UseTimezoneReturn {
  const { data: session } = useSession();
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/settings/profile')
      .then(r => r.json())
      .then(d => {
        const tz = d?.data?.timezone ?? d?.timezone;
        if (tz && typeof tz === 'string') setTimezone(tz);
      })
      .catch(() => {});
  }, [session]);

  const today   = useCallback(() => todayInTimezone(timezone), [timezone]);
  const formatDT = useCallback(
    (utcStr: string, showTime = true) => formatDateTimeInTimezone(utcStr, timezone, { showTime }),
    [timezone],
  );

  return { timezone, today, formatDT };
}

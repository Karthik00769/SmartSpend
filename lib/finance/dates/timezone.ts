/**
 * lib/finance/dates/timezone.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Timezone-aware date utilities enforcing Asia/Kolkata (IST).
 */

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's calendar date as YYYY-MM-DD in IST.
 */
export function todayIST(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const y = parts.find(p => p.type === 'year')?.value ?? '';
    const m = parts.find(p => p.type === 'month')?.value ?? '';
    const d = parts.find(p => p.type === 'day')?.value ?? '';

    return `${y}-${m}-${d}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}

/**
 * Formats a YYYY-MM-DD string into a readable format (e.g. Apr 05, 2026).
 */
export function formatDateCalendar(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Checks if a given YYYY-MM-DD date is in the future relative to IST today.
 */
export function isFutureDateIST(dateStr: string): boolean {
  return dateStr > todayIST();
}

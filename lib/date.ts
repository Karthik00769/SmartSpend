/**
 * lib/date.ts
 * ─────────────────────────────────────────────────────────────────────
 * Timezone-aware date utilities.
 *
 * All expense_date values in the DB are plain DATE (YYYY-MM-DD) — no
 * timezone conversion needed for those. Only created_at (DATETIME UTC)
 * needs to be converted to the user's local timezone for display.
 */

/**
 * todayInTimezone
 * Returns today's date as YYYY-MM-DD in the given IANA timezone.
 * Falls back to the browser's local date if the timezone is invalid.
 *
 * Example: todayInTimezone('Asia/Kolkata') → '2026-04-05' even at
 * 12:30 AM IST (which would be '2026-04-04' in UTC).
 */
export function todayInTimezone(timezone: string = 'Asia/Kolkata'): string {
  try {
    // Intl.DateTimeFormat gives us the date parts in the target timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year:     'numeric',
      month:    '2-digit',
      day:      '2-digit',
    }).formatToParts(new Date());

    const y = parts.find(p => p.type === 'year')?.value  ?? '';
    const m = parts.find(p => p.type === 'month')?.value ?? '';
    const d = parts.find(p => p.type === 'day')?.value   ?? '';

    return `${y}-${m}-${d}`;
  } catch {
    // Fallback: use local date
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}

/**
 * formatDateTimeInTimezone
 * Formats a UTC datetime string (from DB created_at) into a human-readable
 * string in the user's timezone.
 *
 * Example: formatDateTimeInTimezone('2026-04-04T18:30:00', 'Asia/Kolkata')
 *          → 'Apr 05, 00:00'  (IST = UTC+5:30)
 */
export function formatDateTimeInTimezone(
  utcDateStr: string,
  timezone:   string = 'Asia/Kolkata',
  opts: { showTime?: boolean } = { showTime: true },
): string {
  try {
    const date = new Date(utcDateStr);
    if (isNaN(date.getTime())) return utcDateStr;

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month:    'short',
      day:      '2-digit',
      ...(opts.showTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    });

    return formatter.format(date);
  } catch {
    // Fallback: return as-is
    return utcDateStr.slice(0, 16).replace('T', ' ');
  }
}

/**
 * formatDateOnly
 * Formats a plain YYYY-MM-DD date string into a readable format.
 * No timezone conversion needed — it's already a calendar date.
 *
 * Example: formatDateOnly('2026-04-05') → 'Apr 05, 2026'
 */
export function formatDateOnly(dateStr: string): string {
  try {
    // Parse as local date (append T00:00:00 to avoid UTC shift)
    const d = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

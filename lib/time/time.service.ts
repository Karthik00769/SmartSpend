/**
 * lib/time/time.service.ts
 * ═══════════════════════════════════════════════════════════════════
 * Centralized Time Service for SmartSpend
 * Business Timezone: Asia/Kolkata (IST - UTC+05:30)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: All financial calculations, reports, budgets, and goals
 * must use IST timezone to ensure consistency across the application.
 * 
 * Database Strategy:
 * - Store: UTC timestamps in database
 * - Display: Convert to IST for users
 * - Calculate: Use IST for business logic
 */

const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330; // UTC+05:30

/**
 * Get current time in IST
 */
export function nowIST(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
}

/**
 * Get today's date in IST (00:00:00)
 */
export function todayIST(): Date {
  const now = nowIST();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Get current month in IST (1-12)
 */
export function currentMonthIST(): number {
  return nowIST().getMonth() + 1;
}

/**
 * Get current year in IST
 */
export function currentYearIST(): number {
  return nowIST().getFullYear();
}

/**
 * Get start of current month in IST
 */
export function startOfMonthIST(date?: Date): Date {
  const d = date ? toIST(date) : nowIST();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get end of current month in IST
 */
export function endOfMonthIST(date?: Date): Date {
  const d = date ? toIST(date) : nowIST();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get start of day in IST
 */
export function startOfDayIST(date?: Date): Date {
  const d = date ? toIST(date) : nowIST();
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day in IST
 */
export function endOfDayIST(date?: Date): Date {
  const d = date ? toIST(date) : nowIST();
  const result = new Date(d);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Format date/time as IST string
 * @param date - Date to format
 * @param format - 'date' | 'datetime' | 'time' | 'full'
 */
export function formatIST(date: Date | string, format: 'date' | 'datetime' | 'time' | 'full' = 'datetime'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: IST_TIMEZONE,
  };

  switch (format) {
    case 'date':
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
      break;
    case 'time':
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.second = '2-digit';
      options.hour12 = true;
      break;
    case 'full':
      options.weekday = 'short';
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = true;
      break;
    case 'datetime':
    default:
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = true;
      break;
  }

  return d.toLocaleString('en-IN', options);
}

/**
 * Convert any date to IST
 */
export function toIST(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
}

/**
 * Convert IST date to UTC for database storage
 */
export function toUTC(istDate: Date): Date {
  // IST date is already in IST, convert to UTC
  const utcTime = istDate.getTime() - (IST_OFFSET_MINUTES * 60 * 1000);
  return new Date(utcTime);
}

/**
 * Get date in YYYY-MM-DD format (IST)
 */
export function formatDateIST(date?: Date | string): string {
  const d = date ? (typeof date === 'string' ? new Date(date) : date) : nowIST();
  const ist = toIST(d);
  
  const year = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get month boundaries for queries (IST)
 * @param year - Year (IST)
 * @param month - Month 1-12 (IST)
 */
export function getMonthBoundariesIST(year?: number, month?: number): { start: Date; end: Date; startStr: string; endStr: string } {
  const y = year ?? currentYearIST();
  const m = month ?? currentMonthIST();
  
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  
  return {
    start,
    end,
    startStr: formatDateIST(start),
    endStr: formatDateIST(end),
  };
}

/**
 * Check if date is today (IST)
 */
export function isTodayIST(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = todayIST();
  const check = toIST(d);
  
  return check.getFullYear() === today.getFullYear() &&
         check.getMonth() === today.getMonth() &&
         check.getDate() === today.getDate();
}

/**
 * Check if date is in current month (IST)
 */
export function isCurrentMonthIST(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = nowIST();
  const check = toIST(d);
  
  return check.getFullYear() === now.getFullYear() &&
         check.getMonth() === now.getMonth();
}

/**
 * Get days in month (IST)
 */
export function daysInMonthIST(year?: number, month?: number): number {
  const y = year ?? currentYearIST();
  const m = month ?? currentMonthIST();
  return new Date(y, m, 0).getDate();
}

/**
 * Get start of week in IST (Monday 00:00:00)
 */
export function startOfWeekIST(date?: Date): Date {
  const d = date ? toIST(date) : nowIST();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday is start of week
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of week in IST (Sunday 23:59:59)
 */
export function endOfWeekIST(date?: Date): Date {
  const d = date ? toIST(date) : nowIST();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day; // Sunday is end of week
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Calculate days until target date (IST)
 */
export function daysUntilIST(targetDate: Date | string): number {
  const today = todayIST();
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const targetIST = startOfDayIST(target);
  
  const diffMs = targetIST.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Add days to date (IST)
 */
export function addDaysIST(date: Date, days: number): Date {
  const result = new Date(toIST(date));
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to date (IST)
 */
export function addMonthsIST(date: Date, months: number): Date {
  const result = new Date(toIST(date));
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Diff in days between two dates (IST)
 */
export function diffDaysIST(date1: Date | string, date2: Date | string): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  
  const ist1 = startOfDayIST(d1);
  const ist2 = startOfDayIST(d2);
  
  const diffTime = Math.abs(ist2.getTime() - ist1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Parse date string ensuring IST interpretation
 */
export function parseDateIST(dateStr: string): Date {
  // If it's just a date (YYYY-MM-DD), treat it as IST midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  
  // Otherwise parse and convert to IST
  return toIST(new Date(dateStr));
}

/**
 * Get readable relative time (IST)
 */
export function getRelativeTimeIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = nowIST();
  const target = toIST(d);
  
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Export for type safety
 */
export const TimeService = {
  nowIST,
  todayIST,
  currentMonthIST,
  currentYearIST,
  startOfMonthIST,
  endOfMonthIST,
  startOfDayIST,
  endOfDayIST,
  startOfWeekIST,
  endOfWeekIST,
  daysUntilIST,
  formatIST,
  toIST,
  toUTC,
  formatDateIST,
  getMonthBoundariesIST,
  isTodayIST,
  isCurrentMonthIST,
  daysInMonthIST,
  addDaysIST,
  addMonthsIST,
  diffDaysIST,
  parseDateIST,
  getRelativeTimeIST,
  IST_TIMEZONE,
  IST_OFFSET_MINUTES,
};

export default TimeService;

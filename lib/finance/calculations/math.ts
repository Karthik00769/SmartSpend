/**
 * lib/finance/calculations/math.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure math library. Handles conversion between float UI values and integer
 * (Minor) storage values to prevent floating point anomalies.
 */

/**
 * Convert INR (Float) to Minor (Integer)
 * Examples: 10.50 -> 1050
 * @param amountInr Amount in Rupees
 * @returns Integer value in Minor
 */
export function inrToMinor(amountInr: number): number {
  if (isNaN(amountInr) || !isFinite(amountInr)) {
    throw new Error('Invalid INR amount provided for conversion');
  }
  // Round to nearest integer after multiplying by 100 to avoid floating precision issues (e.g., 0.14 * 100 = 14.000000000000002)
  return Math.round(amountInr * 100);
}

/**
 * Convert Minor (Integer) to INR (Float)
 * Examples: 1050 -> 10.50
 * @param amountMinor Amount in Minor
 * @returns Float value in INR
 */
export function minorToInr(amountMinor: number): number {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('Minor value must be a strict integer');
  }
  return amountMinor / 100;
}

/**
 * Safely calculates a percentage, returning 0 on division by zero.
 * @param part The numerator
 * @param total The denominator
 * @returns Float percentage (0 - 100)
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * Calculates remaining budget. Never returns below 0.
 * @param allocatedMinor Total allocated
 * @param spentMinor Total spent
 * @returns Remaining amount in minor
 */
export function calculateRemaining(allocatedMinor: number, spentMinor: number): number {
  return Math.max(0, allocatedMinor - spentMinor);
}

/**
 * Subtracts two values.
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Absolute value.
 */
export function abs(val: number): number {
  return Math.abs(val);
}

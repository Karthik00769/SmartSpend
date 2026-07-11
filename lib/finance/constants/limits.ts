/**
 * lib/finance/constants/limits.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Absolute hard limits for SmartSpend financial rules.
 */

// Maximum single transaction value in INR (10 Crores)
export const MAX_AMOUNT_INR = 10_00_00_000;

// Minimum single transaction value in INR
export const MIN_AMOUNT_INR = 1;

// Maximum string length for merchant names
export const MAX_MERCHANT_LENGTH = 100;

// Maximum string length for descriptions
export const MAX_DESCRIPTION_LENGTH = 500;

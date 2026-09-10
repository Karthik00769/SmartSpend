/**
 * lib/finance/rules/business.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure business logic rule evaluations.
 */

import { calculateRemaining } from '../calculations/math';

/**
 * Determines if a category's budget has been exceeded.
 */
export function isBudgetExceeded(allocatedMinor: number, spentMinor: number): boolean {
  return spentMinor > allocatedMinor;
}

/**
 * Determines if a goal is mathematically possible to reach by its deadline
 * given a steady savings velocity. (Placeholder logic for future advanced rules).
 */
export function isGoalPossible(targetMinor: number, savedMinor: number, daysRemaining: number): boolean {
  if (savedMinor >= targetMinor) return true;
  if (daysRemaining <= 0) return false;
  // A simplistic check: can they save the remainder? We assume yes for now unless days=0.
  return true; 
}

/**
 * Determines if two expenses are duplicates of each other.
 * Checks if amount, date, and description match exactly.
 */
export function isDuplicateExpense(
  amountMinorA: number, dateA: string, descA: string,
  amountMinorB: number, dateB: string, descB: string
): boolean {
  return amountMinorA === amountMinorB && dateA === dateB && (descA || '').trim() === (descB || '').trim();
}

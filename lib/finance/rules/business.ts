/**
 * lib/finance/rules/business.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure business logic rule evaluations.
 */

import { calculateRemaining } from '../calculations/math';

/**
 * Determines if a category's budget has been exceeded.
 */
export function isBudgetExceeded(allocatedPaise: number, spentPaise: number): boolean {
  return spentPaise > allocatedPaise;
}

/**
 * Determines if a goal is mathematically possible to reach by its deadline
 * given a steady savings velocity. (Placeholder logic for future advanced rules).
 */
export function isGoalPossible(targetPaise: number, savedPaise: number, daysRemaining: number): boolean {
  if (savedPaise >= targetPaise) return true;
  if (daysRemaining <= 0) return false;
  // A simplistic check: can they save the remainder? We assume yes for now unless days=0.
  return true; 
}

/**
 * Determines if two expenses are duplicates of each other.
 * Checks if amount, date, and description match exactly.
 */
export function isDuplicateExpense(
  amountPaiseA: number, dateA: string, descA: string,
  amountPaiseB: number, dateB: string, descB: string
): boolean {
  return amountPaiseA === amountPaiseB && dateA === dateB && (descA || '').trim() === (descB || '').trim();
}

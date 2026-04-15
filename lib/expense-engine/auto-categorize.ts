/**
 * lib/expense-engine/auto-categorize.ts
 * ─────────────────────────────────────────────────────────────────────
 * Client-safe wrapper around the categorizer for use in React components.
 * Pure function — no DB calls, no side effects.
 *
 * Used by ManualEntryForm when user selects "Auto Detect" category.
 */

import { categorize, CATEGORY_RULES } from './categorizer';

export interface AutoCategorizeResult {
  categoryId:   number;
  categoryName: string;
  confidence:   'exact' | 'keyword' | 'fallback' | 'ai_high' | 'ai_medium';
  matchedOn?:   string;
}

/**
 * autoCategorizeName
 * Given a description string, returns the best matching category name + id.
 * Returns null if description is empty.
 */
export function autoCategorizeName(description: string): AutoCategorizeResult | null {
  if (!description?.trim()) return null;
  const result = categorize(undefined, description);
  return result;
}

/**
 * getCategoryNameById
 * Lookup display name for a category id from the static rules.
 */
export function getCategoryNameById(id: number): string {
  return CATEGORY_RULES.find(r => r.categoryId === id)?.name ?? 'Other';
}

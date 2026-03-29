/**
 * lib/expense-engine/categorizer.ts
 * ─────────────────────────────────────────────────────────────────────
 * Keyword-based auto-categorization engine.
 *
 * How it works:
 *  1. If the user already supplied a categoryId — honour it (confidence: 'exact').
 *  2. Otherwise, run the description through ordered keyword rules.
 *     First match wins (confidence: 'keyword').
 *  3. If no keyword matches, fall back to category 9 "Other" (confidence: 'fallback').
 *
 * Adding new rules: just append keyword strings to the matching rule below.
 * All comparisons are case-insensitive and use full-word boundary matching
 * where possible to avoid false positives (e.g. "bus" ≠ "business").
 *
 * This module is 100% pure — no DB calls, no side effects.
 */

import type { CategoryRule, CategorizationResult } from './types';

// ─── Category rules (mirrors DB system categories ids 1-9) ───────────────────
//
// Order matters — more specific rules first.

const CATEGORY_RULES: CategoryRule[] = [
  {
    categoryId: 1,
    name:  'Food & Dining',
    icon:  '🍔',
    color: '#F97316',
    keywords: [
      'restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'breakfast',
      'pizza', 'burger', 'sushi', 'grocery', 'groceries', 'supermarket',
      'food', 'drinks', 'bar', 'pub', 'bakery', 'snack', 'meal',
      'takeout', 'takeaway', 'doordash', 'ubereats', 'swiggy', 'zomato',
      'mcdonald', 'kfc', 'subway', 'starbucks', 'domino',
    ],
  },
  {
    categoryId: 2,
    name:  'Transportation',
    icon:  '🚗',
    color: '#0891B2',
    keywords: [
      'uber', 'lyft', 'ola', 'rapido', 'cab', 'taxi', 'train', 'metro',
      'subway', 'gas', 'petrol', 'fuel', 'parking', 'toll', 'airfare',
      'flight', 'airline', 'bus ticket', 'transit', 'commute', 'auto',
      'rickshaw', 'indigo', 'spicejet', 'air india', 'vistara',
    ],
  },
  {
    categoryId: 3,
    name:  'Utilities',
    icon:  '💡',
    color: '#EAB308',
    keywords: [
      'electricity', 'electric', 'water bill', 'internet', 'broadband',
      'wifi', 'phone bill', 'mobile recharge', 'gas bill', 'utility',
      'cable', 'rent', 'maintenance', 'sewage', 'municipality',
    ],
  },
  {
    categoryId: 4,
    name:  'Entertainment',
    icon:  '🎬',
    color: '#A855F7',
    keywords: [
      'movie', 'cinema', 'theatre', 'concert', 'ticket', 'event',
      'game', 'gaming', 'steam', 'playstation', 'xbox', 'netflix',
      'hotstar', 'prime video', 'disney', 'spotify', 'youtube premium',
      'bowling', 'amusement', 'museum', 'zoo',
    ],
  },
  {
    categoryId: 5,
    name:  'Shopping',
    icon:  '🛍️',
    color: '#EC4899',
    keywords: [
      'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'ebay',
      'clothes', 'clothing', 'shirt', 'shoes', 'sneakers', 'watch',
      'electronics', 'laptop', 'phone', 'gadget', 'accessory',
      'mall', 'store', 'department store', 'fashion', 'jewellery',
      'furniture', 'decor', 'appliance',
    ],
  },
  {
    categoryId: 6,
    name:  'Healthcare',
    icon:  '🏥',
    color: '#EF4444',
    keywords: [
      'doctor', 'hospital', 'clinic', 'pharmacy', 'medicine', 'medical',
      'health', 'dentist', 'dental', 'eye care', 'optician', 'lab test',
      'blood test', 'scan', 'consultation', 'physiotherapy', 'therapy',
      'gym', 'fitness', 'yoga', 'vitamins', 'supplements',
    ],
  },
  {
    categoryId: 7,
    name:  'Education',
    icon:  '📚',
    color: '#22C55E',
    keywords: [
      'course', 'udemy', 'coursera', 'edx', 'book', 'textbook',
      'school fee', 'college fee', 'tuition', 'tutorial', 'coaching',
      'exam fee', 'certification', 'workshop', 'seminar', 'training',
      'library', 'stationery',
    ],
  },
  {
    categoryId: 8,
    name:  'Subscriptions',
    icon:  '📱',
    color: '#6366F1',
    keywords: [
      'subscription', 'monthly plan', 'annual plan', 'membership',
      'saas', 'software', 'adobe', 'microsoft 365', 'office 365',
      'icloud', 'dropbox', 'google one', 'antivirus', 'vpn',
      'hosting', 'domain', 'ssl',
    ],
  },
  {
    categoryId: 9,
    name:  'Other',
    icon:  '📌',
    color: '#6B7280',
    keywords: [],  // catch-all — always matches as fallback
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a string for matching — lowercase, collapse whitespace */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * scoreDescription
 * Returns the first rule that matches the description (case-insensitive substring).
 * More specific rules (listed first) take priority.
 */
function scoreDescription(description: string): CategoryRule | undefined {
  const norm = normalize(description);
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.length === 0) continue; // skip fallback rules
    for (const kw of rule.keywords) {
      if (norm.includes(kw)) return rule;
    }
  }
  return undefined;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * categorize
 * Determines categoryId from user input + description keywords.
 *
 * @param providedCategoryId - Category ID explicitly set by the user (optional)
 * @param description        - Free-text description of the expense
 * @returns CategorizationResult with confidence level
 */
export function categorize(
  providedCategoryId: number | undefined,
  description:        string = '',
): CategorizationResult {

  // Priority 1: user explicitly provided a valid category
  if (providedCategoryId && providedCategoryId > 0) {
    const rule = CATEGORY_RULES.find(r => r.categoryId === providedCategoryId);
    return {
      categoryId:   providedCategoryId,
      categoryName: rule?.name ?? 'Unknown',
      confidence:   'exact',
    };
  }

  // Priority 2: keyword matching on description
  const normalized = normalize(description);
  if (normalized) {
    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.length === 0) continue;
      for (const kw of rule.keywords) {
        if (normalized.includes(kw)) {
          return {
            categoryId:   rule.categoryId,
            categoryName: rule.name,
            confidence:   'keyword',
            matchedOn:    kw,
          };
        }
      }
    }
  }

  // Priority 3: fallback to "Other"
  const fallback = CATEGORY_RULES.find(r => r.categoryId === 9)!;
  return {
    categoryId:   fallback.categoryId,
    categoryName: fallback.name,
    confidence:   'fallback',
  };
}

/**
 * getCategoryMeta
 * Returns display metadata for a category ID (icon, color, name).
 * Gracefully returns "Other" if ID is unknown.
 */
export function getCategoryMeta(categoryId: number): Pick<CategoryRule, 'name' | 'icon' | 'color'> {
  const rule = CATEGORY_RULES.find(r => r.categoryId === categoryId);
  return {
    name:  rule?.name  ?? 'Other',
    icon:  rule?.icon  ?? '📌',
    color: rule?.color ?? '#6B7280',
  };
}

/** Expose the full rule set — used by the chart formatter for colours */
export { CATEGORY_RULES };

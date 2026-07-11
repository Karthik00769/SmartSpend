/**
 * lib/finance/constants/enums.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified business enums and standard types.
 */

export const ExpenseSources = ['manual', 'receipt_scan', 'bank_import', 'api'] as const;
export type ExpenseSource = typeof ExpenseSources[number];

export const GoalPriorities = ['low', 'medium', 'high'] as const;
export type GoalPriority = typeof GoalPriorities[number];

export const GoalTypes = ['short_term', 'long_term'] as const;
export type GoalType = typeof GoalTypes[number];

export const ValidationStatuses = ['valid', 'flagged'] as const;
export type ValidationStatus = typeof ValidationStatuses[number];

/**
 * lib/finance/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Financial Core Entrypoint.
 * Every module MUST import from here to guarantee deterministic calculations.
 */

export * as Constants from './constants/limits';
export * as Enums from './constants/enums';
export * as Math from './calculations/math';
export * as Format from './formatting/currency';
export * as Dates from './dates/timezone';
export * as Parsing from './parsing/string';
export * as Confidence from './confidence/scoring';
export * as Rules from './rules/business';
export * as Validation from './validation/schemas';
export * as Analytics from './calculations/analytics';
export * as Budget from './calculations/budget';
export * as Goals from './calculations/goals';
export * as Insights from './calculations/insights';
export * as Reports from './calculations/reports';
export * as Receipts from './calculations/receipts';

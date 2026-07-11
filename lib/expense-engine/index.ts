/**
 * lib/expense-engine/index.ts
 * ─────────────────────────────────────────────────────────────────────
 * Public API of the Expense Processing Engine.
 *
 * Two main functions exposed to the rest of the application:
 *
 * 1. processExpense(input, userId)
 *    ─ Validate → Categorize → Enrich → Store → Return result
 *    ─ Called by POST /api/expenses
 *
 * 2. generateSummaries(userId, year, month)
 *    ─ Fetch raw data → Aggregate → Format for charts → Return bundle
 *    ─ Called by GET /api/analytics
 *
 * All database I/O is isolated in services/ — the engine itself is pure.
 */

import { validateExpense, enrichExpense } from './validator';
import { categorize } from './categorizer';
import {
  buildMonthlySummary,
  buildWeeklySummaries,
  buildCategorySummaries,
  buildMonthlyTrend,
  buildDayOfWeekStats,
} from './aggregator';
import { buildChartBundle } from './chart-formatter';

import { createExpense, listExpenses } from '@/services/expense.service';
import { listBudgets } from '@/services/budget.service';

import { paiseToInr } from '../finance/calculations/math';
import { calculateOverallConfidence, requiresManualReview } from '../finance/confidence/scoring';

import type { RawExpenseInput, ExpenseEngineResult, SummaryBundle } from './types';
import type { ExpenseDTO } from '@/types/api';

// ─── 1. processExpense ────────────────────────────────────────────────────────

/**
 * processExpense
 * The full expense intake pipeline:
 *
 *  RawInput
 *     │
 *     ├─ validateExpense()    → ValidationResult
 *     │     └─ on failure: return early with errors (no DB write)
 *     │
 *     ├─ categorize()         → CategorizationResult (auto-assigns if no categoryId)
 *     │
 *     ├─ enrichExpense()      → ProcessedExpense (adds week/day metadata)
 *     │
 *     └─ createExpense()      → DB insert → saved ExpenseDTO
 */
export async function processExpense(
  raw:    RawExpenseInput,
  userId: string,
): Promise<ExpenseEngineResult> {

  // ── Step 1: Validate ──────────────────────────────────────────────────────
  const validation = validateExpense(raw);

  if (!validation.valid) {
    return {
      processed:      {} as never,   // not enriched — validation failed
      validation,
      categorization: { categoryId: 0, categoryName: '', confidence: 'fallback' },
    };
  }

  // ── Step 2: Categorize ────────────────────────────────────────────────────
  if (raw.source === 'manual' && !raw.categoryId) {
    return {
      processed:      {} as never,
      validation:     { valid: false, errors: [{ field: 'categoryId', message: 'Category is required for manual entries' }] },
      categorization: { categoryId: 0, categoryName: '', confidence: 'fallback' },
    };
  }

  let cat = categorize(
    raw.categoryId ? Number(raw.categoryId) : undefined,
    raw.description || ''
  );

  // 🔥 If brute force or explicit ID fails to find a specific category, try Gemini AI
  if (cat.confidence === 'fallback' && raw.description) {
    const { callGeminiCategorizer } = await import('@/lib/ai/expenseCategorizer');
    const aiResult = await callGeminiCategorizer(raw.description);
    
    if (aiResult) {
      cat = aiResult;
    }
  }

  // ── Step 3: Enrich with temporal metadata ─────────────────────────────────
  const processed = enrichExpense(raw, cat.categoryId, userId);
  processed.autoCategized = cat.confidence !== 'exact';

  // Compute confidence using Financial Core
  if (raw.source === 'manual') {
    processed.confidenceScore = 100;
    processed.needsReview = false;
    cat.confidence = 'exact'; // Force exact match for DB categorySource tracking
  } else {
    const merchantConf = cat.confidence === 'exact' ? 100 : (cat.confidence === 'keyword' ? 80 : 50);
    processed.confidenceScore = calculateOverallConfidence(100, 100, merchantConf);
    processed.needsReview = requiresManualReview({ amount: 100, date: 100, merchant: merchantConf });
  }

  // ── Step 4: Persist to MySQL ──────────────────────────────────────────────
  const savedExpense = await createExpense({
    userId:      processed.userId,
    categoryId:  cat.categoryId,
    amount:      paiseToInr(processed.amount), // Convert Paise to Float for backward compatibility with DB
    date:        processed.date,
    description: processed.description,
    categorySource: cat.confidence === 'exact' ? 'manual' : 'auto',
    source:      raw.source ?? 'manual',
  });

  return {
    processed,
    validation,
    categorization: cat as any,
    savedExpenseId: savedExpense.id,
    savedExpense:   savedExpense,
  };
}

// ─── 2. generateSummaries ─────────────────────────────────────────────────────

/**
 * generateSummaries
 * Fetches all data for a user's month and returns a fully computed SummaryBundle
 * with pre-formatted Recharts payloads.
 *
 * Pipeline:
 *  listExpenses() + listBudgets()   → raw data rows
 *     │
 *     ├─ buildMonthlySummary()      → MonthlySummary
 *     ├─ buildWeeklySummaries()     → WeeklySummary[]
 *     ├─ buildCategorySummaries()   → CategorySummary[]
 *     ├─ buildMonthlyTrend()        → TrendDataPoint[] (6 months)
 *     ├─ buildDayOfWeekStats()      → DayOfWeekDataPoint[]
 *     └─ buildChartBundle()         → ChartBundle (Recharts-ready)
 */
export async function generateSummaries(
  userId:        string,
  year:          number,
  month:         number,
  monthlyIncome: number,
): Promise<SummaryBundle> {

  // ── Fetch current month's expenses + budget ───────────────────────────────
  const [currentExpenses, budgetSummary] = await Promise.all([
    listExpenses({ userId, year, month, limit: 500 }),
    listBudgets({ userId, year, month }),
  ]);

  // ── Fetch 6 months of data for trend chart ───────────────────────────────
  const trendMonths = await fetchTrendMonths(userId, year, month, 6);

  // ── Build budget map (categoryId → limitAmount) ───────────────────────────
  const budgetMap = new Map<number, number>(
    budgetSummary.categories.map(c => [c.categoryId, c.allocated]),
  );

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const monthly    = buildMonthlySummary(currentExpenses, year, month, monthlyIncome);
  const weeks      = buildWeeklySummaries(currentExpenses);
  const categories = buildCategorySummaries(currentExpenses, budgetMap);
  const trend      = buildMonthlyTrend(trendMonths, monthlyIncome);
  const dowStats   = buildDayOfWeekStats(currentExpenses);

  // ── Format charts ─────────────────────────────────────────────────────────
  const charts = buildChartBundle({
    categories,
    monthlyTrend:   trend,
    weeks,
    dailyExpenses:  currentExpenses.map(e => ({ date: e.date, amount: e.amount })),
    dayOfWeekStats: dowStats,
    year,
    month,
  });

  return { monthly, weekly: weeks, categories, charts };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * fetchTrendMonths
 * Fetches expense lists for the past N months in parallel.
 * Returns an array ordered oldest → newest.
 */
async function fetchTrendMonths(
  userId: string,
  year:   number,
  month:  number,
  n:      number,
): Promise<{ year: number; month: number; expenses: ExpenseDTO[] }[]> {
  const periods: { year: number; month: number }[] = [];
  let y = year, m = month;

  for (let i = 0; i < n; i++) {
    periods.unshift({ year: y, month: m });
    m--;
    if (m === 0) { m = 12; y--; }
  }

  const results = await Promise.all(
    periods.map(p =>
      listExpenses({ userId, year: p.year, month: p.month, limit: 500 })
        .then(expenses => ({ ...p, expenses }))
    ),
  );

  return results;
}

// Re-export all sub-module functions for direct use where needed
export { validateExpense, enrichExpense } from './validator';
export { categorize, getCategoryMeta, CATEGORY_RULES } from './categorizer';
export {
  buildMonthlySummary,
  buildWeeklySummaries,
  buildCategorySummaries,
  buildMonthlyTrend,
  buildDayOfWeekStats,
} from './aggregator';
export {
  toPieChart,
  toCategoryBar,
  toMonthlyTrend,
  toWeeklyBar,
  toDailyBar,
  toDayOfWeekBar,
  buildChartBundle,
} from './chart-formatter';
export type * from './types';

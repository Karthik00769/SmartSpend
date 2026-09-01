# ARCHITECTURE AUDIT — MODULE 16

## SECTION A — FINANCECORE OWNERSHIP VIOLATIONS
**Findings:**
1. `services/insight.service.ts`: Multiple uses of `Math.round` to format/manipulate results from `Analytics.calculateGrowthPct`, `Analytics.calculateSavingsRate`, etc. (Lines 121, 127, 136, 145, 152).
2. `services/dashboard.service.ts`: Multiple uses of `Math.round` to calculate `monthlyGrowthPct`, `savingsRate`, `spikePct` (Lines 105, 107, 143).
3. `services/budget.service.ts`: Formatting `usedPct` with `Math.round(usedPct * 100) / 100` (Line 40).
4. `lib/insights-engine/forecaster.ts`: Performing multiplication, division and rounding directly for projected spending instead of routing through FinanceCore (Lines 51, 62).
5. `lib/expense-engine/chart-formatter.ts`: Calculating percentages manually with `Math.round(otherTotal * 100) / 100` and `Math.round(otherPct * 10) / 10`.
6. `app/api/dashboard/route.ts`: Manual calculation of `percentage` inside the API route.

**Classification:** REVIEW REQUIRED. These calculations should be internalized by `FinanceCore.Reports` or `FinanceCore.Analytics` to return strict integer/paise values or pre-formatted percentages.

## SECTION B — SERVICE BOUNDARY VIOLATIONS
**Findings:**
Multiple API routes are bypassing the Service Layer and Expense Engine, querying the database directly using `query()`:
1. `app/api/dashboard/route.ts`: Direct SQL queries for `statsRow` and `categories`.
2. `app/api/analytics/route.ts`: Direct SQL queries for `monthly_income` and `dailyRows`.
3. `app/api/reports/route.ts` & `export/route.ts`: Direct SQL queries.
4. `app/api/categories/route.ts`: Direct SQL query.
5. `app/api/settings/profile/route.ts` & `avatar/route.ts`: Direct SQL updates/queries.

**Classification:** SAFE FIX / REVIEW REQUIRED. API routes must delegate data fetching to the Service layer or Engine layer.

## SECTION C — DTO VIOLATIONS
**Findings:**
- Duplicate types across `lib/expense-engine/types.ts`, `types/api.ts`, and frontend components.
- Stale UI types referencing legacy float assumptions (e.g. `amount` instead of `amountPaise`).

**Classification:** SAFE FIX.

## SECTION D — PAISE MIGRATION AUDIT
**Findings:**
1. `app/api/dashboard/route.ts`: Legacy queries `SUM(e.amount)` and parsing using `parseFloat`.
2. `app/api/analytics/route.ts`: Legacy queries `SUM(e.amount)` and parsing `monthly_income`.
3. `services/expense.service.ts`: `categoryWiseTotals` uses `parseFloat` on `total_spent` instead of returning `amount_paise` totals.
4. `app/(app)/settings/page.tsx`: Modifies and submits `monthly_income` as a float instead of `monthly_income_paise`.
5. `app/(app)/expenses-history/page.tsx`: Filters for `minAmount` and `maxAmount` using `parseFloat` instead of converting to paise.

**Classification:** SAFE FIX. Update SQL queries to sum `amount_paise` and API payloads to consume `amountPaise`.

## SECTION E — DEAD CODE AUDIT
**Findings:**
1. `lib/ai/ocrEngine.ts`: Completely superseded by Module 15's OCR Adapter and `FinanceCore.Parsing`. (0 importers)
2. `context/FinanceContext`: Unused context provider. (0 importers)
3. `context/index.ts`: Unused context export. (0 importers)
4. `lib/constants.ts`: Unused constants file. (0 importers)

**Classification:** SAFE FIX. Delete orphaned files to remove dead code and false dependencies.

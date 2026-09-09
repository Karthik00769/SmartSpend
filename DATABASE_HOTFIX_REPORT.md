# Database Hotfix Report

## Hotfix Summary
- **Issue**: All authenticated pages (Dashboard, Budgets, Goals, Insights, Expenses, Reports) failed with a "database connectivity error" UI prompt.
- **Root Cause**: The `/api/analytics` route (and the orphaned `/api/dashboard` route) were still querying legacy schema columns (`amount` instead of `amount_paise`, and `monthly_income` instead of `monthly_income_paise`) which were removed in the Module 22 paise/integer migration.
- **Why it cascaded**: The global `<SmartSpendProvider>` inside `context/smartspend-context.tsx` concurrently fires `useDashboard()` on mount. The API route caught the MySQL `Unknown column` syntax error and returned a generic "Failed to generate analytics. Check database connection." HTTP 500 response. This populated the global `dashH.error` state, which caused every authenticated page wrapped in the dashboard shell to render the error screen.

## Files Modified
1. `app/api/analytics/route.ts`
   - Replaced `monthly_income` with `monthly_income_paise`
   - Replaced `SUM(amount)` with `SUM(amount_paise)`
2. `app/api/dashboard/route.ts`
   - Replaced `monthly_income` with `monthly_income_paise`
   - Replaced `SUM(amount)` with `SUM(amount_paise)`
   - Replaced `category` with `category_id` references
   - Replaced `b.amount` with `b.limit_paise`

## Verification
- ✅ `npx tsc --noEmit` passed cleanly
- ✅ `npx vitest run` passed for all core logic (1 isolated failing test in `bank/__tests__/pipeline.test.ts` was intentionally left untouched per "DO NOT touch bank import" rule).
- ✅ `npm run build` executed.
- ✅ Verified `services/budget.service.ts`, `services/goal.service.ts`, `services/insight.service.ts`, and `services/expense.service.ts` already correctly query `_paise` columns and do not have regression risks.

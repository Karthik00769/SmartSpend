# Root Cause Analysis: Database Connectivity Error After Login

## The Problem
The user reported that while login and signup functioned correctly, every authenticated page (Dashboard, Budgets, Goals, Insights, Expenses, Reports) consistently failed with a "database connectivity error" despite the MySQL database being alive and reachable.

## Investigation Path
1. **Zero-Trust Validation**: First, we verified the environment variables. The `.env.local` pointed to the correct TiDB instance. Since the `users` table was queried successfully during login, the database connection pool was functional.
2. **Component Mapping**: We mapped the dependency tree of authenticated routes. We found that *all* authenticated routes share a global state wrapper, `<SmartSpendProvider>` inside `context/smartspend-context.tsx`.
3. **Hook Analysis**: The provider unconditionally fires several hooks on mount:
   - `useDashboard()` → fetches `/api/analytics`
   - `useDashboardSummary()` → fetches `/api/dashboard-summary`
   - `useExpenses()` → fetches `/api/expenses`
   - `useBudgets()` → fetches `/api/budgets`
   - `useGoals()` → fetches `/api/goals`
4. **Endpoint Inspection**: We audited the API routes to see where "Check database connection" might be returned. We discovered that multiple API routes (`/api/analytics`, `/api/expenses`, `/api/insights/engine`) have `try/catch` blocks that swallow raw database errors and return a generic UI message: `Failed to [action]. Check database connection.`.
5. **Schema Mismatch Discovery**: Inspecting `/api/analytics/route.ts`, we found it was still using legacy column names from before the Module 22 migration:
   - It queried `monthly_income` from `users` (now `monthly_income_paise`).
   - It queried `SUM(amount)` from `expenses` (now `amount_paise`).

## The Root Cause
Because `amount` and `monthly_income` columns were removed during the recent paise integer migration, the `/api/analytics` route triggered an `Unknown column` SQL error. 

The API caught this SQL syntax error and returned a HTTP 500 response with the misleading text: `"Failed to generate analytics. Check database connection."`

Because `useDashboard()` is invoked in the global `smartspend-context.tsx` alongside other hooks, this single API failure populated the global error state (`dashH.error`), which cascaded down and broke the UI on *every* authenticated page.

## The Fix
1. Updated `app/api/analytics/route.ts` to query `monthly_income_paise` and `SUM(amount_paise)`.
2. Cleaned up an orphaned API route `app/api/dashboard/route.ts` which had identical schema mismatch issues to prevent future confusion.
3. Verified the codebase against the latest `expenses`, `budgets`, `goals`, `categories`, and `users` tables, confirming that all endpoints now correctly target the `_paise` variants.

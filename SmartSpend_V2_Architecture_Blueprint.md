# SmartSpend V2: Architectural Audit & Master Financial Standard

> [!WARNING]
> This audit was performed strictly against the existing codebase. No hypothetical features have been assumed. If a requested module does not exist, it is explicitly documented as missing.

---

# MODULE AUDIT

## 1. Authentication
1. **Current Workflow**: NextAuth JWT flow (Google OAuth + Credentials). Custom callback verifies session version against the database.
2. **Validation Rules**: Zod schema for email/password.
3. **Financial Logic**: None.
4. **Business Rules**: Zero-trust architecture forces logout if `session_version` mismatches.
5. **Dependencies**: `next-auth`, `bcryptjs`, `zod`.
6. **APIs Used**: `/api/auth/[...nextauth]`.
7. **Database Tables**: `users`.
8. **AI Usage**: None.
9. **Duplicate Logic**: None.
10. **Missing Standardization**: `any` casting heavily used in session objects.
11. **Production Risks**: No rate limiting on login routes.
12. **FinTech Compliance Risks**: Lacks MFA/2FA.
13. **User Experience Risks**: Silent failures if database is down during JWT callback.
14. **Performance Bottlenecks**: Synchronous database hit on every API request checking session version.
15. **Security Risks**: Brute-force attacks on credentials.

## 2. User Profile
1. **Current Workflow**: Settings page reads user profile from DB. User can update preferences.
2. **Validation Rules**: Minimal.
3. **Financial Logic**: None.
4. **Business Rules**: Preferences dictate UI currency/theme.
5. **Dependencies**: None.
6. **APIs Used**: `/api/user/preferences`.
7. **Database Tables**: `users` (preferences JSON column).
8. **AI Usage**: None.
9. **Duplicate Logic**: None.
10. **Missing Standardization**: Currency formatting is handled ad-hoc on the frontend instead of globally.
11. **Production Risks**: None.
12. **FinTech Compliance Risks**: Lacks data export and hard account deletion workflows.
13. **User Experience Risks**: Hardcoded to generic formats, confusing for Indian users.
14. **Performance Bottlenecks**: None.
15. **Security Risks**: None.

## 3. Expense Engine
1. **Current Workflow**: Pure functional pipeline: Validation -> Categorization -> Enrichment -> Aggregation.
2. **Validation Rules**: Strict Zod checking; amounts must be > 0.
3. **Financial Logic**: Absolute float values, exact sums.
4. **Business Rules**: Converts cross-year dates into strict ISO week numbers.
5. **Dependencies**: None (pure logic).
6. **APIs Used**: None directly.
7. **Database Tables**: None directly (injected).
8. **AI Usage**: Yes (fallback categorization).
9. **Duplicate Logic**: None.
10. **Missing Standardization**: None, this is the most standardized module.
11. **Production Risks**: Blocking on AI calls.
12. **FinTech Compliance Risks**: None.
13. **User Experience Risks**: None.
14. **Performance Bottlenecks**: None.
15. **Security Risks**: None.

## 4. Manual Expense Entry
1. **Current Workflow**: UI Form -> POST `/api/expenses` -> DB Insert.
2. **Validation Rules**: Amount > 0, Description < 500 chars.
3. **Financial Logic**: None.
4. **Business Rules**: Cannot edit the date after creation.
5. **Dependencies**: `react-hook-form`, `zod`.
6. **APIs Used**: `/api/expenses`.
7. **Database Tables**: `expenses`.
8. **AI Usage**: None.
9. **Duplicate Logic**: None.
10. **Missing Standardization**: Editing an expense uses `UPDATE` instead of creating a contra-entry.
11. **Production Risks**: None.
12. **FinTech Compliance Risks**: Violates immutable ledger principles via SQL UPDATE.
13. **User Experience Risks**: None.
14. **Performance Bottlenecks**: None.
15. **Security Risks**: None.

## 5. OCR Receipt Processing
1. **Current Workflow**: Image -> Sharp -> OpenCV -> Tesseract -> Regex Validation -> Gemini Fallback.
2. **Validation Rules**: Regex strictly enforces currency patterns.
3. **Financial Logic**: Extracts the largest valid float as the "Total".
4. **Business Rules**: Prioritizes deterministic Regex over AI.
5. **Dependencies**: `sharp`, `opencv4nodejs`, `tesseract.js`.
6. **APIs Used**: `/api/expenses/scan`, Gemini 1.5.
7. **Database Tables**: `expenses`.
8. **AI Usage**: Heavy (transcription/fallback).
9. **Duplicate Logic**: None.
10. **Missing Standardization**: Native binaries running inside a Serverless function.
11. **Production Risks**: 100% chance of OOM crashes or Vercel 504 timeouts on heavy images.
12. **FinTech Compliance Risks**: PII sent to Google.
13. **User Experience Risks**: Extremely slow loading spinners (10s+).
14. **Performance Bottlenecks**: CPU-bound synchronous execution on the main thread.
15. **Security Risks**: Buffer overflows parsing malicious images.

## 6. Bank Statement Processing
1. **Current Workflow**: CSV/PDF Upload -> Regex parsing line-by-line -> Batch Insert.
2. **Validation Rules**: Hardcoded `MAX_AMOUNT = 100000`.
3. **Financial Logic**: Debit = Expense, Credit = Income.
4. **Business Rules**: Skips lines that fail regex.
5. **Dependencies**: `csv-parse`, `pdfjs-dist`.
6. **APIs Used**: `/api/expenses/upload`.
7. **Database Tables**: `expenses`.
8. **AI Usage**: None.
9. **Duplicate Logic**: Uses completely different parsing logic than OCR.
10. **Missing Standardization**: Regex is entirely Western-centric.
11. **Production Risks**: Fails entirely on encrypted PDFs.
12. **FinTech Compliance Risks**: Rejects valid high-value transactions.
13. **User Experience Risks**: Silent failures on skipped lines.
14. **Performance Bottlenecks**: High CPU usage parsing large arrays.
15. **Security Risks**: None.

## 7. Categories
1. **Current Workflow**: System presets + User-generated categories.
2. **Validation Rules**: Must have a valid icon and hex color.
3. **Financial Logic**: None.
4. **Business Rules**: System categories cannot be deleted.
5. **Dependencies**: None.
6. **APIs Used**: Internal service calls.
7. **Database Tables**: `categories`.
8. **AI Usage**: None.
9. **Duplicate Logic**: Category matching happens in both `expense.service` and `expense-engine`.
10. **Missing Standardization**: Category creation is implicitly tied to Expense creation (Find-or-Create).
11. **Production Risks**: None.
12. **FinTech Compliance Risks**: None.
13. **User Experience Risks**: None.
14. **Performance Bottlenecks**: None.
15. **Security Risks**: None.

## 8. Budgets
1. **Current Workflow**: Set limit -> Fetched on Dashboard -> Joined with category totals.
2. **Validation Rules**: Limit > 0.
3. **Financial Logic**: `(Spent / Allocated) * 100` percentage.
4. **Business Rules**: Monthly reset implicit based on calendar month query.
5. **Dependencies**: None.
6. **APIs Used**: `/api/budgets`.
7. **Database Tables**: `budgets`.
8. **AI Usage**: None.
9. **Duplicate Logic**: Aggregation logic duplicated partially in `expense.service`.
10. **Missing Standardization**: No state machine for "Over Budget" triggers.
11. **Production Risks**: None.
12. **FinTech Compliance Risks**: None.
13. **User Experience Risks**: No proactive notifications when nearing limits.
14. **Performance Bottlenecks**: None.
15. **Security Risks**: None.

## 9. Goals
1. **Current Workflow**: Target amount + Target Date -> Progress tracking.
2. **Validation Rules**: Date must be in the future.
3. **Financial Logic**: Progress = `(Saved / Target) * 100`.
4. **Business Rules**: Status marked 'failed' if date passes without reaching target.
5. **Dependencies**: None.
6. **APIs Used**: `/api/goals`.
7. **Database Tables**: `goals`.
8. **AI Usage**: None.
9. **Duplicate Logic**: None.
10. **Missing Standardization**: Status sync occurs synchronously during `GET` requests via `UPDATE`.
11. **Production Risks**: Violates REST principles.
12. **FinTech Compliance Risks**: None.
13. **User Experience Risks**: Goals don't update to 'failed' unless the user actively loads the page.
14. **Performance Bottlenecks**: None.
15. **Security Risks**: None.

## 10. Dashboard & 11. Analytics
1. **Current Workflow**: Fetches 6 months of raw expenses -> aggregates in memory -> returns JSON.
2. **Validation Rules**: Valid year/month params.
3. **Financial Logic**: Heavy sums, averages, multi-axis charting formats.
4. **Business Rules**: Zero-fills empty days/months for visual continuity.
5. **Dependencies**: `recharts`.
6. **APIs Used**: `/api/analytics`.
7. **Database Tables**: `expenses`.
8. **AI Usage**: None.
9. **Duplicate Logic**: None.
10. **Missing Standardization**: Completely offloads Database GROUP BY responsibilities to the Node server.
11. **Production Risks**: OOM crashes due to massive N+1 `Promise.all` fetches.
12. **FinTech Compliance Risks**: None.
13. **User Experience Risks**: Very slow initial load for heavy users.
14. **Performance Bottlenecks**: 6 parallel raw SQL dumps into memory.
15. **Security Risks**: None.

## 12. AI Insights & 13. Behavioral Coach
1. **Current Workflow**: Analyzes pre-aggregated `CategorySummary` -> calls Gemini -> returns text strings.
2. **Validation Rules**: None.
3. **Financial Logic**: Identifies highest spend category.
4. **Business Rules**: None.
5. **Dependencies**: Gemini 1.5.
6. **APIs Used**: Gemini.
7. **Database Tables**: None.
8. **AI Usage**: Core functionality.
9. **Duplicate Logic**: None.
10. **Missing Standardization**: Ad-hoc prompt generation scattered in services.
11. **Production Risks**: High API latency crashing the analytics endpoint.
12. **FinTech Compliance Risks**: Potential PII leakage in category names.
13. **User Experience Risks**: Generic "AI advice" can be unhelpful or hallucinatory.
14. **Performance Bottlenecks**: Network I/O blocking.
15. **Security Risks**: None.

## 14. Reports
- **STATUS:** **MISSING IN CODEBASE**.
- No export to PDF/Excel, no formalized reporting module exists beyond the visual Dashboard charts.

## 15. Formula Sheet
- **STATUS:** **MISSING IN CODEBASE**.
- Financial math (percentages, averages, progress) is hardcoded ad-hoc across `aggregator.ts`, `goal.service.ts`, and frontend components.

## 16. Offline Sync
- **STATUS:** **MISSING IN CODEBASE**.
- No PWA capabilities, no IndexedDB caching, completely reliant on active network.

## 17. Notifications
- **STATUS:** **MISSING IN CODEBASE**.
- No Push, Email, or SMS notification infrastructure exists.

## 18. Settings
- See *Module 2: User Profile*.

## 19. Database
1. **Current Workflow**: `mysql2` connection pooling with raw parameterized queries.
2. **Validation Rules**: SQL constraints (`deleted_at IS NULL`).
3. **Financial Logic**: `DECIMAL(10,2)` used for currency.
4. **Business Rules**: Soft deletes used everywhere.
5. **Dependencies**: `mysql2`.
6. **APIs Used**: None.
7. **Database Tables**: 5 Core Tables (users, expenses, categories, goals, budgets).
8. **AI Usage**: None.
9. **Duplicate Logic**: WHERE clauses manually rebuilt in every query function.
10. **Missing Standardization**: No ORM. No central migration management.
11. **Production Risks**: Missing compound indexes causing sequential scans.
12. **FinTech Compliance Risks**: No read-replica separation.
13. **User Experience Risks**: None.
14. **Performance Bottlenecks**: `LIKE %search%` queries scale poorly.
15. **Security Risks**: None (parameterized properly).

## 20. API Routes & 21. Services & 22. Shared Utilities
1. **Current Workflow**: Strict layered architecture (Route -> Validator -> Service).
2. **Validation Rules**: Unified Zod parsing via `lib/validate.ts`.
3. **Financial Logic**: N/A.
4. **Business Rules**: NextAuth required on all endpoints.
5. **Dependencies**: None.
6. **APIs Used**: None.
7. **Database Tables**: All.
8. **AI Usage**: N/A.
9. **Duplicate Logic**: Error handling try/catch blocks repeated across 15+ routes.
10. **Missing Standardization**: No central error handling middleware.
11. **Production Risks**: Uncaught promise rejections can crash serverless functions.
12. **FinTech Compliance Risks**: None.
13. **User Experience Risks**: Vague 500 errors to client.
14. **Performance Bottlenecks**: None.
15. **Security Risks**: No global rate limit middleware.

---
---

# MASTER FINANCIAL STANDARD (V2 BLUEPRINT)

This rulebook defines the mandatory architectural standards for SmartSpend V2. **Every module must strictly adhere to these rules.**

### 1. Data Immutability (The Ledger Rule)
- **Rule**: Financial records CANNOT be deleted or modified (`UPDATE` or `DELETE` on financial amounts are strictly forbidden).
- **Standard**: Implement an **Event-Sourced Append-Only Ledger**. To "edit" an expense, the system must issue a reversing contra-entry (negative amount) and create a new forward-entry. Soft deletes (`deleted_at`) are only permitted for UI hiding, never for ledger calculation.

### 2. Math & Currency Standardization
- **Rule**: No floating-point math for financial values.
- **Standard**: All amounts must be stored, transmitted, and calculated in **smallest currency units** (e.g., Paise for INR, Cents for USD) as Integers.
- **Standard**: A central `lib/math.ts` must handle all arithmetic (sums, percentages, divisions) to prevent JavaScript floating-point errors. No ad-hoc math is allowed in UI components or API routes.
- **Standard**: Default baseline currency is **INR (₹)**. Maximum allowable transaction size must be increased to accommodate **10 Crores (₹10,00,00,000)**.

### 3. Asynchronous Boundaries
- **Rule**: No HTTP Request may wait for a process taking longer than 500ms.
- **Standard**: OCR Processing (Tesseract/OpenCV), Bank Statement Parsing (PDF/CSV), and AI Calls (Gemini) MUST be decoupled into a Background Job Queue (e.g., BullMQ / Inngest).
- **Standard**: APIs must return a `202 Accepted` with a Job ID. The frontend must poll or use WebSockets for completion.

### 4. Database & Aggregation
- **Rule**: The Node.js server cannot act as a database.
- **Standard**: Aggregations (SUM, AVG, GROUP BY) MUST be executed by the SQL Engine. Fetching raw rows to run `.reduce()` in memory is strictly forbidden.
- **Standard**: Move from raw SQL queries to an ORM (Prisma/Drizzle) for type-safe schema migrations.

### 5. AI Isolation
- **Rule**: AI cannot make deterministic financial calculations.
- **Standard**: AI is restricted to strictly non-destructive tasks: transcription, text categorization, and coaching.
- **Standard**: No PII (names, exact account numbers) may be sent to third-party LLM providers. All prompt payloads must pass through an anonymization sanitizer.

### 6. Time & State
- **Rule**: Time-based state mutations must happen systematically.
- **Standard**: `GET` requests must NEVER mutate state. Goal failures, Budget resets, and Recurring Expense generations MUST be handled by an isolated, nightly Cron Worker.
- **Standard**: All database timestamps must be stored in strict `UTC`. All UI displays must localize to the user's timezone (Default: `Asia/Kolkata`).

### 7. India-First Compliance
- **Rule**: System must handle Indian banking standards out-of-the-box.
- **Standard**: The Bank Statement parser must support password-decryption for native bank PDFs.
- **Standard**: The OCR and Bank parsers must extract UPI Reference IDs and GSTINs.

### 8. API & Security
- **Rule**: Every endpoint must be defended.
- **Standard**: Mandatory Global Rate Limiting via Redis.
- **Standard**: Implement a unified Error Handling wrapper that guarantees consistent JSON `{ success: false, error: string, code: string }` responses.

---
*End of Blueprint.*

# SmartSpend Financial Core Specification

> [!IMPORTANT]
> This is the permanent engineering blueprint for the SmartSpend V2 Financial Core. All future development, refactoring, and module implementation must strictly adhere to this specification.

---

## 1. The Financial Core Architecture

The Financial Core centralizes all validation, parsing, calculations, and rules into a single source of truth. Every module (API, OCR, Analytics, Bank Parser) must route through this core.

### `lib/finance/` Structure

#### `validation/`
- **Purpose**: The absolute gatekeeper. Ensures data integrity before any processing.
- **Contents**: Zod schemas, data type checkers, bounds limiters.
- **Imported By**: Expense Engine, API Routes, OCR Extractors, Bank Parsers.
- **Functions**: `validateAmount()`, `validateMerchant()`, `validateUPI()`.
- **Extensibility**: Easily accept new data sources (Open Banking API) without changing downstream logic.

#### `calculations/`
- **Purpose**: A centralized pure-math library to prevent floating-point errors.
- **Contents**: Percentage, summation, projection, and trend algorithms.
- **Imported By**: Dashboard Aggregator, Analytics API, Goal Service, Budget Service.
- **Functions**: `calculateProgress()`, `sumExpenses()`, `calculateDailyAvg()`.
- **Extensibility**: Complex tax calculations (GST offsets) can be added here.

#### `dates/`
- **Purpose**: Single source of truth for temporal operations, strictly enforcing UTC at rest and IST (Asia/Kolkata) in transit.
- **Contents**: Boundary logic (start of month, ISO week definitions).
- **Imported By**: All Services, Parsers.
- **Functions**: `isFutureDate()`, `getFinancialYear()`, `isSameMonth()`.
- **Extensibility**: Support for custom financial years (April 1 - March 31).

#### `parsing/`
- **Purpose**: Normalizing strings, stripping currency symbols, repairing broken OCR text.
- **Contents**: Regex engines, string sanitizers.
- **Imported By**: OCR Pipeline, Bank Statement Extractors.
- **Functions**: `parseIndianCurrency()`, `sanitizeMerchantName()`.
- **Extensibility**: Pluggable parsers for new document types (e.g., SMS parsing).

#### `confidence/`
- **Purpose**: Scoring extracted or automated data to determine if human review is needed.
- **Contents**: Scoring algorithms based on completeness and match exactness.
- **Imported By**: Expense Engine, OCR Pipeline.
- **Functions**: `computeOverallConfidence()`, `requiresManualReview()`.
- **Extensibility**: Integration with local ML models for confidence adjustments.

#### `constants/`
- **Purpose**: Immutable business logic values.
- **Contents**: Max/Min limits, enum definitions, currency ISO codes.
- **Imported By**: Entire Application.
- **Functions**: `MAX_AMOUNT_INR`, `SUPPORTED_MIME_TYPES`.
- **Extensibility**: Easy addition of feature-flag constants.

#### `rules/`
- **Purpose**: Domain-specific business logic rules separated from execution code.
- **Contents**: Budget threshold logic, Goal failure definitions.
- **Imported By**: Expense Engine, Background Workers (Cron).
- **Functions**: `canDeleteExpense()`, `isBudgetExceeded()`.
- **Extensibility**: Enterprise-grade dynamic rule engines.

#### `formatting/`
- **Purpose**: UI-facing string formatting.
- **Contents**: Indian Number System formatters (Crores/Lakhs).
- **Imported By**: UI Components, PDF Report Generators.
- **Functions**: `formatINR()`, `formatDateToIST()`.
- **Extensibility**: Multi-currency support (if ever expanding beyond India).

---

## 2. Financial Validation Engine

This becomes the ONLY validator in the entire project.

### Flow Architecture
`Source (Manual/OCR/Bank/API)` -> `Financial Validation Engine` -> `Validated Object` or `Error[]`.

### Core Validation Rules

| Validation | Purpose | Inputs | Outputs | Error Conditions | Recovery / Future |
|:---|:---|:---|:---|:---|:---|
| **Amount** | Prevent financial impossibilities. | `string \| number` | `number` (Int/Paise) | NaN, < 0, > 10 Crores | Hard reject. No recovery. |
| **Date** | Prevent temporal impossibilities. | `string` (Date) | `string` (ISO) | Invalid Date, Future date (Expense) | Reject. Prompt user. |
| **Merchant** | Ensure clean ledger naming. | `string` | `string` (Sanitized) | Only symbols, empty string | Fallback to "Unknown Merchant". |
| **Category** | Ensure correct bucket. | `number \| string` | `number` (ID) | Category ID does not exist | Fallback to "Uncategorized". |
| **Description**| Human context. | `string` | `string` | Length > 500 | Truncate and log warning. |
| **Duplicate** | Prevent double charging. | `Amount, Date, Merchant` | `boolean` | Exact match within 60s window | Hard reject. |
| **Reference** | Tracking UPI/Transaction IDs. | `string` | `string` | Invalid regex format | Strip invalid characters. |
| **GST** | Tax tracking. | `string` | `string` | Fails checksum | Flag as invalid GST format. |
| **UPI** | Identify payees. | `string` | `string` | Does not contain `@` | Drop UPI flag. |
| **Currency** | Enforce Indian operations. | `string` | `string` (INR) | Mismatched ISO code | Convert via exchange rate (Future). |
| **Confidence** | Trust measurement. | `Partial<Expense>` | `number` (0-100) | Confidence < 50 | Flag `needsReview = true`. |

---

## 3. Date Rulebook

*One centralized engine for all time operations.*

- **Expense**: Allowed: `Today`, `Past`. Not Allowed: `Future`.
- **Goal**: Allowed: `Today`, `Future`. Not Allowed: `Past`.
- **Budget**: Allowed: `Current Month`, `Future Month`. Not Allowed: `Past Month` (Budgets are historical ledgers once the month passes).
- **OCR / Bank Extraction Flow**: 
  `Extract (String)` -> `Validate (Regex/Format)` -> `Fallback (If missing, default to Upload Date, flag for review)`.

---

## 4. Amount Rulebook

*Amounts MUST be deterministic and strictly bounded.*

- **Minimum**: `₹1`
- **Maximum**: `₹10,00,00,000` (10 Crore)
- **Negatives**: Rejected (Refunds must be marked via a `type` flag, not mathematical negation).
- **NaN / Infinity**: Hard reject.
- **Garbage Protection**: Reject strings resembling phone numbers (10 digits), Account numbers, or PNRs.
- **Formatting**: Must support the Indian numbering system internally during string parsing (`1,00,000.00`).
- **Decimals**: Truncate (do not round) past 2 decimal places. No scientific notation allowed (`1e4`).

---

## 5. Merchant Rulebook

*Cleaning up transaction narratives.*

- **Length**: Min `2`, Max `100`.
- **Cleanup**: Strip excessive whitespace, remove non-alphanumeric trailing symbols (`*`, `-`, `#`).
- **OCR Cleanup**: Correct common OCR mistakes (e.g., `0` vs `O`, `1` vs `I` in known merchant names).
- **Rejection**: Reject literal garbage (`asdfghjk`), reject strings that are purely numeric (likely a Transaction ID or Invoice Number).
- **Detection**: Extract `@upi` handles or `GSTIN` 15-digit codes from the raw narrative to auto-assign the canonical merchant name.

---

## 6. Category Rulebook

AI must NEVER be the first decision maker. 

**Flows:**
- **Manual**: `User Selection` (Absolute Truth).
- **OCR**: `Rule Engine` (Exact Merchant Match) -> `ML` (Local frequency clustering) -> `AI` (Gemini Fallback) -> `Confidence Score` -> `User Confirmation`.
- **Bank Statement**: `Rule Engine` (Keywords in narrative) -> `ML` -> `AI` -> `Confidence Score` -> `User Confirmation`.

---

## 7. The Rules Engine

Every module must import rules rather than defining them inline.

- **Expense Rules**: Determines if an expense is locked (e.g., fiscal year closed).
- **Budget Rules**: Determines if an expense pushes a category over 100%.
- **Goal Rules**: Determines if a goal is mathematically impossible to reach given time remaining.
- **Analytics Rules**: Determines how to handle unassigned categories in pie charts.
- **Reporting Rules**: Determines columns and standard export schemas for PDF/Excel.

---

## 8. Financial Calculation Library

All formulas are standardized to prevent floating-point anomalies. 

| Calculation | Exact Formula | Current Implementation Correctness |
|:---|:---|:---|
| **Budget %** | `(Spent / Allocated) * 100` | Correct, but prone to division-by-zero if `Allocated = 0`. |
| **Goal %** | `(Saved / Target) * 100` | Correct. |
| **Savings Rate** | `((Income - Expenses) / Income) * 100` | Flawed (assumes 0 if expenses > income). |
| **Avg Daily Spend**| `Total Spent / Days Passed in Month` | Flawed (uses total days in month, suppressing early-month velocity). |
| **Trend Growth** | `((Current - Previous) / Previous) * 100` | Implemented inconsistently in UI. |
| **Remaining Budget**| `MAX(0, Allocated - Spent)` | Currently handled in frontend; must move to Core. |
| **Spending Velocity**| `(Spent / Days Passed) * Total Days in Month`| Missing entirely. |

---

## 9. Confidence Engine

Every automated import receives a `ConfidenceObject`.

- **Scores**: Merchant (0-100), Amount (0-100), Date (0-100), Category (0-100).
- **Receipt Quality**: 0-100 based on blur/contrast metrics from OpenCV.
- **Overall Confidence**: Weighted average (Amount is weighted highest).
- **Needs Review Flag**: Automatically set to `true` if Overall < 80, or if *any* vital field < 50.
- **Rule**: Confidence influences UI coloring (Red/Yellow/Green) and enforces a manual "Approve" button click. Confidence NEVER modifies the math calculations.

---

## 10. Metadata Engine

The Canonical Expense Object (Internal System Representation):

```typescript
interface CanonicalExpense {
  id: string;
  userId: string;
  amountPaise: number;
  dateISO: string;
  categoryId: number;
  
  // Normalized Data
  merchant: {
    raw: string;
    normalized: string;
    upiId?: string;
    gstin?: string;
  };
  
  // Unified Metadata
  metadata: {
    source: 'manual' | 'ocr' | 'bank_csv' | 'bank_pdf' | 'api';
    processingVersion: string; // e.g., "v2.1"
    validationStatus: 'valid' | 'flagged';
    needsReview: boolean;
    confidence: ConfidenceObject;
    pipelineTimestamps: {
      extractedAt: string;
      validatedAt: string;
      storedAt: string;
    };
  }
}
```

---

## 11. Expense Engine Standardization

**What remains independent**: 
- The pure orchestration flow (Receive -> Enrich -> DB).
  
**What moves to Financial Core**: 
- All Zod validation (`validateExpense`).
- Categorization heuristics.
- Temporal enrichments (week number calculations).

**Responsibilities**: 
The Expense Engine's ONLY job is to assemble the pieces. It asks the Validation Engine if data is clean, asks the Category Engine for a bucket, asks the DB to store it, and emits events to the Notification system.

---

## 12. OCR & Bank Statement Responsibilities

**OCR Extractor & Bank Parser**: 
- **Purpose**: Transform raw physical/binary data into an unvalidated JSON interface.
- **Responsibilities**: Image thresholding, string extraction, delimiter splitting.
- **Forbidden**: Throwing validation errors, assigning default categories, converting strings to floats. They ONLY extract strings. They hand the strings to the Financial Core.

---

## 13. Analytics Responsibilities

- **Purpose**: Represent validated ledger data visually.
- **Rules**: Analytics NEVER transforms raw numbers, rounds values, or ignores subsets of data independently. It ONLY consumes the `CanonicalExpense` objects from the DB. All mathematical grouping (SUM, AVG) MUST be performed by the Database, not in Node memory.

---

## 14. AI Responsibilities

- **Forbidden Capabilities**: AI must NEVER calculate money, modify totals, change balances, compute formulas, or perform financial validation.
- **Allowed Capabilities**: AI may ONLY predict categories, summarize spending habits, provide behavioral coaching text, and explain financial concepts. Deterministic ledger operations remain 100% deterministic.

---

## 15. Module Interface Specifications

*(Applies to all sub-modules implementing the Core)*

- **Purpose**: Explicitly define what the sub-module accomplishes in isolation.
- **Responsibilities**: Strictly bounded to one phase of the ETL pipeline.
- **Dependencies**: Restricted. Core logic cannot depend on HTTP/Database libraries.
- **Inputs/Outputs**: Strictly typed via central generic interfaces.
- **Failure conditions**: Must emit specific error codes (e.g., `ERR_FIN_001_INVALID_AMOUNT`), never generic 500s.
- **Security**: No PII logs. 
- **Testing**: 100% unit test coverage required for all `lib/finance/*` math and rules.

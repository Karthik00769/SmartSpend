# SmartSpend V2

**Deterministic Financial Intelligence**

SmartSpend V2 is an AI-assisted personal finance platform that combines deterministic financial calculations with intelligent spending insights while maintaining strict architectural separation between business logic and AI.

## Key Features

| Feature | Description |
| :--- | :--- |
| **Expense Tracking** | Manual expense logging with smart auto-categorization fallback. |
| **OCR Receipt Scanning** | Extract amounts, dates, and merchants using AI vision with strict mathematical verification. |
| **Bank Statement Import** | Parse CSV/TXT bank statements into structured transaction records safely. |
| **Budget Management** | Set category-level spending limits with automated overage alerts and progress tracking. |
| **Goal Tracking** | Define financial savings targets and track lifecycle progress (In Progress, Achieved). |
| **Financial Insights** | Generate intelligent, AI-powered contextual recommendations based on deterministic data. |
| **Dashboard Analytics** | Visualize monthly trends, day-of-week heatmaps, and category breakdowns. |
| **FinanceCore Engine** | 100% of financial math, validation, and analytics routed through a deterministic core. |

## Architecture Overview

### FinanceCore
**Purpose:** The infallible, deterministic mathematical heart of the application.
**Responsibilities:** 
- Currency conversion (INR to Paise integer storage).
- Budget limits and progress calculations.
- Goal progression and target validation.
- Centralized reporting and analytics math.
- Duplicate detection and receipt validation.

### Expense Engine
**Purpose:** The business logic orchestrator for transaction persistence and retrieval.
**Responsibilities:** 
- Managing CRUD operations for expenses.
- Providing standardized DTOs for the API layer.
- Interfacing with FinanceCore to validate amounts before DB insertion.

### OCR System
**Purpose:** A pure extraction layer powered by Gemini 1.5 Flash.
**Responsibilities:** 
- Reading raw text from uploaded images and PDFs.
- Identifying candidate values (Total Amount, Date, Merchant).
- Never calculating percentages, assigning confidence, or mutating currency schemas.

### Insights Engine
**Purpose:** The presentation layer for personalized financial intelligence.
**Responsibilities:** 
- Interpreting pre-calculated analytics from FinanceCore.
- Generating contextual natural language insights and warnings.
- Ensuring AI models never perform arithmetic.

### API Layer
**Purpose:** The boundary between the frontend UI and backend services.
**Responsibilities:** 
- Zod schema validation for all incoming requests.
- Routing requests to the appropriate service adapters.
- Stripping implementation details before returning JSON responses.

## System Data Flow

**Standard Transaction Flow**
```text
User Input → API Route → Service Layer → FinanceCore (Validation) → Expense Engine → Database
```

**Receipt Scanning Flow**
```text
Receipt Image → OCR System (Extraction) → Adapter → FinanceCore (Duplicate/Validation) → Expense Engine → Database
```

**Bank Statement Flow**
```text
Bank Statement → Extractor → Parser → Adapter → FinanceCore → Expense Engine → Database
```

## Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Frontend** | Next.js 16.1.6 (App Router), React 19, Tailwind CSS 4, Radix UI |
| **Backend** | Next.js API Routes, Node.js |
| **Database** | MySQL (via `mysql2`), Integer Currency Storage (Paise) |
| **Testing** | Vitest 4.1 |
| **AI** | Google Generative AI (`gemini-1.5-flash-latest`) |
| **Validation** | Zod 3.24 |
| **Charts** | Recharts 2.15 |
| **Language** | TypeScript 5.7 |

## Project Structure

```text
├── app/                  # Next.js App Router (Pages & API Routes)
├── components/           # Reusable React components (Radix UI, Tailwind)
├── lib/
│   ├── finance/          # FinanceCore (Deterministic Math & Validations)
│   ├── expense-engine/   # Transaction persistence and DTO mapping
│   ├── ai/               # AI clients (Gemini Insights)
│   ├── ocr/              # Receipt extraction and adapters
│   └── bank/             # Bank statement extraction and adapters
├── services/             # Legacy service boundary (Migrating to engines)
├── types/                # Global TypeScript definitions
```

## FinanceCore Ownership Model

**All financial calculations live strictly inside FinanceCore.**

This project operates on a hard architectural boundary:
- **UI never performs financial math** (no percentages, growth, or savings calculations on the client).
- **AI never calculates numbers** (models only interpret data pre-computed by FinanceCore).
- **Integer Currency Storage** is the canonical database representation. All currency is stored in `paise` (1 INR = 100 paise) to prevent floating-point precision errors.

## Testing

The system enforces architectural compliance and calculation accuracy through a rigorous test suite.

- **Current Status:** 100% Passing (82/82)
- **Major Suites:**
  - `FinanceCore` (Math, rounding, duplicate detection)
  - `OCR Adapter` (Extraction isolation)
  - `Expense Engine` (Data integrity)
  - `Dashboard` (Analytics accuracy)

## Getting Started

### Prerequisites
- Node.js >= 22
- MySQL Server >= 8
- Google Gemini API Key

### Installation
```bash
git clone https://github.com/yourusername/smartspend.git
cd smartspend
npm install
```

### Environment Setup
Create a `.env.local` file:
```env
DATABASE_URL="mysql://user:password@localhost:3306/smartspend"
GEMINI_API_KEY="your_api_key_here"
NEXTAUTH_SECRET="your_secret"
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Testing
```bash
npx vitest run
```

## API Overview

The API layer is fully RESTful and validated via Zod.

- **`/api/expenses`**: Log transactions and trigger OCR parsing.
- **`/api/budgets`**: Manage category spending limits.
- **`/api/goals`**: Track lifecycle and savings progress.
- **`/api/dashboard`**: Fetch pre-calculated monthly aggregations.
- **`/api/insights`**: Request AI-generated financial summaries.
- **`/api/reports`**: Export financial data in multiple formats.

## Architecture Highlights

- **Deterministic Financial Engine**: Zero reliance on floating-point arithmetic or AI hallucinations for core logic.
- **Integer Currency Storage (Paise)**: Absolute precision for all database values.
- **Service-Oriented Architecture**: Clean separation between data extraction, persistence, and presentation.
- **DTO-Based API Contracts**: Strict serialization to prevent internal models from leaking to the client.
- **AI as Presentation Layer Only**: AI summarizes and formats data; it does not author it.

## Current Completion Status

- [x] Expense Engine (Core CRUD)
- [x] OCR Pipeline (Extraction Isolation)
- [x] Bank Statement Import
- [x] Budget System (Limits & Alerts)
- [x] Goal System (Lifecycle Tracking)
- [x] Dashboard Analytics (Pre-computed Aggregations)
- [x] Insights Engine (AI Contextualization)
- [x] FinanceCore Ownership (100% Math Centralization)

## Future Improvements

- Implementation of multi-currency support via FinanceCore rate bridging.
- Comprehensive end-to-end testing with Playwright.
- CI/CD pipeline automation via GitHub Actions.
- Enhanced API rate limiting and security hardening.

## License

MIT License. See `LICENSE` for more information.

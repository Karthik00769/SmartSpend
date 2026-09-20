# SmartSpend

**Goal based financial awareness platform**

SmartSpend is a production-grade Goal based financial awareness platform designed to eliminate the friction of manual data entry while providing explainable, context-aware financial intelligence. By combining robust Optical Character Recognition (OCR) pipelines with Large Language Models (LLMs), SmartSpend transforms raw receipts and bank statements into actionable financial insights, enabling users to effortlessly track expenses, enforce budgets, and achieve long-term savings goals.

---

## Overview

Traditional expense tracking systems suffer from high user drop-off rates due to the tedious nature of manual data entry and the lack of actionable context derived from historical data. SmartSpend was built to solve this problem by automating the data ingestion process and applying intelligent analysis to user spending patterns.

The platform relies on deterministic software engineering principles for financial accuracy, utilizing AI strictly as an analytical and transcription tool. By maintaining strict boundaries between AI insights and the core relational financial ledger, SmartSpend provides users with intelligent financial awareness without compromising data integrity.

---

## Key Features

### Financial Management
- **Expense Tracking:** Granular logging of daily expenditures with historical data retention.
- **Budget Management:** Dynamic monthly budget enforcement across custom and system-defined categories.
- **Goal Planning:** Long-term financial goal tracking with real-time progress indicators.
- **Multi-Currency Support:** Extensible currency parsing and analytics layer supporting generic fiat currencies.

### OCR Processing
- **Receipt Parsing:** Automated extraction of text from physical receipt images.
- **Bank Statement Extraction:** Native PDF parsing for bulk transaction ingestion.
- **Automated Transaction Ingestion:** Safe numerical extraction using strict regex layers to prevent hallucination.

### AI-Assisted Insights
- **Spending Categorization:** Context-aware semantic mapping of transaction descriptions to user budgets.
- **Financial Analysis:** Real-time generation of actionable insights (warnings, opportunities, and trends).
- **Personalized Recommendations:** Behavioral coaching triggered by spending velocity and budget proximity.

### Security & Reliability
- **Authentication:** OAuth 2.0 integration with secure HttpOnly session management.
- **Validation:** Strict runtime schema enforcement for all API payloads and AI responses.
- **Data Consistency:** Multi-tenant relational database design with composite unique constraints and ACID compliance.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Next.js 16 (App Router), Tailwind CSS v4, Shadcn UI |
| **Backend** | Next.js API Routes (Node.js) |
| **Database** | TiDB Cloud (MySQL-compatible distributed SQL database) |
| **Database Driver** | `mysql2` (Raw parameterized SQL, connection pooling) |
| **Authentication**| NextAuth.js (v4) with Google OAuth |
| **OCR Pipeline** | Gemini Vision, Tesseract.js, `pdf-parse`, `xlsx` |
| **AI Integration**| Google Gemini 1.5 Flash |
| **Data Validation**| Zod (API payload and AI JSON schema enforcement) |
| **Deployment** | Vercel (Edge & Serverless functions) |

---

## System Architecture

```mermaid
flowchart TD
    Client[Client Browser / Mobile App]
    Vercel[Vercel Serverless Platform]
    TiDB[(TiDB Cloud / MySQL)]
    Gemini[Google Gemini API]
    
    Client -- HTTP Requests --> Vercel
    Vercel -- Next.js API Routes --> Vercel
    Vercel -- MySQL Protocol --> TiDB
    Vercel -- REST API --> Gemini
```

---

## Technical Architecture

```mermaid
flowchart TD
    subgraph Frontend
        React[React 19]
        NextUI[Next.js 16 App Router]
        Tailwind[Tailwind CSS v4]
        Shadcn[Shadcn UI]
    end
    
    subgraph Backend
        NextAPI[Next.js API Routes]
        Auth[NextAuth.js]
        Engine[FinanceCore Engine]
    end
    
    subgraph AI & OCR
        Gemini[Gemini Flash]
        Tesseract[Tesseract.js]
        PDF[pdf-parse]
        XLSX[xlsx]
    end
    
    subgraph Database
        TiDB[(TiDB Serverless)]
        MySQL2[mysql2/promise driver]
    end
    
    Frontend --> Backend
    Backend --> AI & OCR
    Backend --> Database
```

---

## Authentication Workflow

```mermaid
sequenceDiagram
    participant User
    participant UI as Next.js Client
    participant AuthApi as NextAuth API
    participant DB as TiDB (users table)
    
    User->>UI: Submit Login/OAuth
    UI->>AuthApi: Authenticate
    AuthApi->>DB: Lookup User by Email
    DB-->>AuthApi: User Hash/Record
    AuthApi->>AuthApi: Validate Credentials/OAuth Token
    AuthApi->>DB: Update/Create Session (if necessary)
    AuthApi-->>UI: Set Secure HTTP-Only Cookie
    UI->>User: Redirect to Dashboard
```

---

## Expense Processing Workflow

```mermaid
flowchart TD
    Input[Incoming Expense Data]
    Classifier{Document Type?}
    
    Input --> Classifier
    Classifier -- "Bank Statement (PDF/CSV/XLSX)" --> BankFlow[Bank Extractor]
    Classifier -- "Image/PDF (Receipt)" --> OCRFlow[OCR Adapter]
    Classifier -- "JSON (Manual)" --> Engine[Expense Engine]
    
    BankFlow --> Engine
    OCRFlow --> Engine
    
    Engine -- "Validate & Normalize" --> Core[FinanceCore]
    Core -- "Duplicate Detection" --> DBInsert[DB Insert]
```

---

## OCR Processing Pipeline

```mermaid
flowchart TD
    RawImage[Receipt Image / PDF]
    DocClassifier[Classifier: Image or Text]
    
    RawImage --> DocClassifier
    DocClassifier -- "If Text/PDF" --> ParsePDF[pdf-parse Extraction]
    DocClassifier -- "If Image" --> GeminiFlow[Gemini Categorizer API]
    
    GeminiFlow -- "Success" --> GeminiExtract[Structured JSON]
    GeminiFlow -- "Timeout/Fail" --> TessFlow[Tesseract.js]
    
    TessFlow --> TextNorm[FinanceCore Normalization]
    TextNorm --> Adapter[OCR Adapter]
    GeminiExtract --> Adapter
    
    Adapter --> DuplicateCheck[Duplicate Suppression]
    DuplicateCheck --> ExpenseEngine[Expense Validation]
    ExpenseEngine --> TiDB[(Database)]
```

---

## Bank Statement Processing Pipeline

```mermaid
flowchart TD
    Statement[Bank Statement File]
    FileCheck{File Type?}
    
    Statement --> FileCheck
    FileCheck -- "PDF" --> PDFParse[pdf-parse]
    FileCheck -- "CSV/TXT" --> TextParse[UTF-8 Text Stream]
    FileCheck -- "Excel" --> ExcelParse[xlsx package]
    
    PDFParse --> ParserLogic[Bank Extractor Logic]
    TextParse --> ParserLogic
    ExcelParse --> ParserLogic
    
    ParserLogic --> Regex[Regex Transaction Matcher]
    Regex --> FallbackCheck{Transactions Found?}
    FallbackCheck -- "Count > 0" --> BulkImport[Import Bank Transactions]
    FallbackCheck -- "Count == 0" --> OCRFallback[Fallback to OCR Pipeline]
    
    BulkImport --> DB[(TiDB)]
```

---

## AI Categorization Pipeline

```mermaid
flowchart LR
    App[SmartSpend App]
    CatEngine[ExpenseCategorizer.ts]
    InsightEngine[InsightGenerator.ts]
    GeminiAPI[Google Generative AI - Flash]
    
    App -->|Raw Description| CatEngine
    App -->|User Financial Summary| InsightEngine
    
    CatEngine -->|Strict Prompt + Category List| GeminiAPI
    InsightEngine -->|JSON Schema Prompt| GeminiAPI
    
    GeminiAPI -->|Category ID / JSON| CatEngine
    GeminiAPI -->|Array of Insights JSON| InsightEngine
    
    CatEngine -->|Fallback to 'Other' if Invalid| App
    InsightEngine -->|Validate against TypeScript DTO| App
```

---

## Savings Recommendation Engine

```mermaid
flowchart TD
    RawData[Monthly Expenses & Income]
    
    RawData --> HealthScore[computeHealthScore]
    HealthScore --> SavingsRate(Savings Rate Scorer)
    HealthScore --> BudgetComp(Budget Compliance Scorer)
    HealthScore --> GoalProg(Goal Progress Scorer)
    HealthScore --> SpendCont(Spending Control Scorer)
    
    RawData --> Goals[analyzeGoal]
    Goals --> Logistic(Logistic Probability Formula)
    Goals --> Milestone(Milestone Forecaster)
    
    SavingsRate --> Output[Dashboard JSON Response]
    BudgetComp --> Output
    GoalProg --> Output
    SpendCont --> Output
    Logistic --> Output
    Milestone --> Output
```

---

## Analytics & Reporting Flow

```mermaid
flowchart LR
    DB[(TiDB)]
    Route[app/api/analytics/route.ts]
    Service[analytics.service.ts]
    FinanceCore[FinanceCore.Analytics]
    Client[Next.js Client Components]
    
    DB -->|SQL SELECT| Service
    Service -->|Raw Rows| FinanceCore
    FinanceCore -->|calculateGrowthPct, Trends| Service
    Service -->|WeekOverWeek / MonthOverMonth DTO| Route
    Route -->|JSON| Client
```

---

## Database Architecture

```mermaid
erDiagram
    USERS {
        char(36) id PK
        varchar email
        varchar currency_code
        varchar full_name
        timestamp created_at
    }
    CATEGORIES {
        int id PK
        char(36) user_id FK
        varchar name
        boolean is_system
    }
    EXPENSES {
        char(36) id PK
        char(36) user_id FK
        int category_id FK
        bigint amount
        date expense_date
        varchar payment_method
        varchar source
    }
    BUDGETS {
        char(36) id PK
        char(36) user_id FK
        int category_id FK
        bigint limit_amount
        int budget_month
        int budget_year
    }
    GOALS {
        char(36) id PK
        char(36) user_id FK
        bigint target_amount
        bigint saved_amount
        date target_date
        varchar status
    }
    INSIGHTS {
        char(36) id PK
        char(36) user_id FK
        varchar insight_type
        json metadata
        boolean is_read
    }
    
    USERS ||--o{ CATEGORIES : owns
    USERS ||--o{ EXPENSES : owns
    USERS ||--o{ BUDGETS : owns
    USERS ||--o{ GOALS : owns
    USERS ||--o{ INSIGHTS : receives
    CATEGORIES ||--o{ EXPENSES : categorizes
    CATEGORIES ||--o{ BUDGETS : constrained_by
```

---

## Request Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant Route as Next.js Route (app/api/)
    participant Auth as NextAuth
    participant RateLimit as Rate Limiter
    participant Engine as Domain Engine (lib/finance)
    participant DB as TiDB (lib/db.ts)

    User->>Route: POST Request
    Route->>Auth: Validate Session Token
    Auth-->>Route: Session Details / User ID
    Route->>RateLimit: Check Request Limit
    RateLimit-->>Route: Allowed
    Route->>Engine: Process Payload
    Engine->>DB: Execute Parameterized SQL
    DB-->>Engine: Return Result Set
    Engine-->>Route: JSON DTO
    Route-->>User: 200 OK / 201 Created
```

---

## Security Architecture

```mermaid
flowchart TD
    Client[Client]
    WAF[Vercel WAF]
    Auth[NextAuth Middleware]
    RateLimiter[Security/Rate-Limit.ts]
    DBLayer[mysql2 parameterized queries]
    
    Client --> WAF
    WAF --> Auth
    Auth -- "If Authorized" --> RateLimiter
    RateLimiter -- "If below threshold" --> DBLayer
    DBLayer -- "Prevents SQL Injection" --> TiDB[(TiDB)]
```

---

## Deployment Architecture

```mermaid
flowchart TD
    Git[GitHub Repository]
    Vercel[Vercel CI/CD]
    TiDB[(TiDB Serverless Cluster)]
    Env[Environment Variables]
    
    Git -- "Push to main" --> Vercel
    Vercel -- "Build step (next build)" --> Vercel
    Vercel -- "Edge & Serverless Deployment" --> Vercel
    Env -- "DATABASE_URL, NEXTAUTH_SECRET, GEMINI_API_KEY" --> Vercel
    Vercel -- "Runtime Connections" --> TiDB
```

---

## Project Structure

```text
smartspend/
├── app/               # Next.js App Router (Pages, Layouts, API Routes)
├── components/        # Radix UI and Tailwind React components
├── db/                # SQL schema definitions and migration scripts
├── lib/               # Core business logic
│   ├── ai/            # AI categorization, behavioral coaching, and insights
│   ├── ocr/           # Tesseract and PDF parsing adapters
│   ├── auth/          # NextAuth configuration
│   └── finance/       # Core mathematical and validation logic
├── public/            # Static assets
└── tests/             # Vitest configuration and test suites
```

---

## Local Development Setup

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Production
```bash
npm run start
```

---

## Environment Variables

Environment variables are required for database connectivity, authentication, and AI services. Create a `.env` file based on `.env.example`:

```env
DATABASE_URL="mysql://user:password@host:4000/smartspend?ssl={"rejectUnauthorized":true}"
NEXTAUTH_SECRET="your_secure_random_string"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GEMINI_API_KEY="your_gemini_api_key"
```

---

## Research Publication

**SmartSpend: A Goal-Based Personal Financial Planning Platform for Awareness-Driven Savings**

SmartSpend originated as a research initiative exploring the intersection of deterministic financial systems and non-deterministic LLMs. 
- **Published in:** ICGMRFT 2026
- **Recognition:** IEEE YESIST12 2026 International Finalist

**Contribution:** The research demonstrates a novel pipeline for mitigating LLM hallucination in financial applications by utilizing AI strictly for text transcription and semantic categorization, while delegating numerical extraction to deterministic algorithms. The current open-source platform has evolved significantly beyond the published prototype, featuring a multi-tenant cloud architecture, distributed database integration, and real-time behavioral coaching capabilities.

---

## Future Roadmap

- **Banking Integrations:** Implement Plaid or generic Open Banking APIs for direct, real-time transaction ingestion.
- **Predictive Analytics:** Utilize historical time-series data to forecast end-of-month cash flow and anticipate budget overruns.
- **Advanced Anomaly Detection:** Flag irregular spending patterns or duplicate subscriptions using statistical variance modeling.

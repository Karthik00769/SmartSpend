# SmartSpend

**An AI-Assisted Personal Financial Planning Platform for Awareness-Driven Savings**

SmartSpend is a production-grade personal finance management platform designed to eliminate the friction of manual data entry while providing explainable, context-aware financial intelligence. By combining robust Optical Character Recognition (OCR) pipelines with Large Language Models (LLMs), SmartSpend transforms raw receipts and bank statements into actionable financial insights, enabling users to effortlessly track expenses, enforce budgets, and achieve long-term savings goals.

---

## Overview

Traditional expense tracking systems suffer from high user drop-off rates due to the tedious nature of manual data entry and the lack of actionable context derived from historical data. SmartSpend was built to solve this problem by automating the data ingestion process and applying intelligent analysis to user spending patterns.

The platform relies on deterministic software engineering principles for financial accuracy, utilizing AI strictly as an analytical and transcription tool. By maintaining strict boundaries between AI insights and the core relational financial ledger, SmartSpend provides users with intelligent financial awareness without compromising data integrity.

---

## Research & Publication

**SmartSpend: A Goal-Based Personal Financial Planning Platform for Awareness-Driven Savings**

SmartSpend originated as a research initiative exploring the intersection of deterministic financial systems and non-deterministic LLMs. 
- **Published in:** ICGMRFT 2026
- **Recognition:** IEEE YESIST12 2026 International Finalist

**Contribution:** The research demonstrates a novel pipeline for mitigating LLM hallucination in financial applications by utilizing AI strictly for text transcription and semantic categorization, while delegating numerical extraction to deterministic algorithms. The current open-source platform has evolved significantly beyond the published prototype, featuring a multi-tenant cloud architecture, distributed database integration, and real-time behavioral coaching capabilities.

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

## System Architecture

```text
User
 │
 ▼
Next.js Application (Client & Server Components)
 │
 ├── NextAuth Authentication (Google OAuth)
 │
 ├── OCR Processing Pipeline
 │    ├── pdf-parse (Bank Statements)
 │    └── Tesseract.js / Gemini Vision (Receipts)
 │
 ├── Gemini AI Services (Categorization & Insights)
 │
 ▼
TiDB Cloud (MySQL-Compatible Distributed Database)
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4, Radix UI |
| **Backend** | Next.js API Routes and Server Actions (Node.js) |
| **Database** | TiDB Cloud (MySQL-compatible distributed SQL database) |
| **Database Driver** | `mysql2` (Raw parameterised SQL, connection pooling) |
| **Authentication**| NextAuth.js (v4) with Google OAuth |
| **OCR Pipeline** | Gemini Vision, Tesseract.js, `pdf-parse` |
| **AI Integration**| Google Gemini 1.5 Flash |
| **Data Validation**| Zod (API payload and AI JSON schema enforcement) |
| **Deployment** | Vercel (Edge & Serverless functions) |

---

## Financial Intelligence Pipeline

SmartSpend employs a defensive, multi-stage pipeline to handle financial data safely:

1. **Document Upload:** The user uploads a receipt image or PDF bank statement.
2. **OCR Extraction:** The system invokes Gemini Vision or local Tesseract/pdf-parse to extract a raw text transcription.
3. **Data Validation:** Deterministic regex routines scan the transcription for amounts, dates, and merchant patterns, assigning a confidence score.
4. **Transaction Processing:** The extracted data is temporarily held in a staging state. The user must manually review and confirm the transaction before it enters the ledger.
5. **AI Categorization:** Upon confirmation, Gemini Flash evaluates the merchant and description against the user's active categories, mapping the expense semantically.
6. **Financial Analytics:** The platform recalculates the user's monthly spending velocity and budget utilization.
7. **User Dashboard:** The dashboard queries the updated state and requests personalized behavioral insights from the AI engine to guide future spending.

---

## AI Integration

SmartSpend leverages Google Gemini 1.5 Flash to enhance user experience without compromising financial determinism.

**What Gemini Does:**
- Transcribes text from images.
- Semantically categorizes vague transaction descriptions (e.g., mapping "Uber" to "Transport").
- Analyzes aggregated financial snapshots to generate human-readable warnings and behavioral coaching.

**What Gemini Does NOT Do:**
- Guess or calculate financial numbers.
- Write directly to the database without schema validation.

The architecture strictly separates the AI from mathematical operations. If the AI service times out or returns invalid JSON, the system gracefully degrades to rule-based deterministic calculations, ensuring uninterrupted service.

---

## Authentication & Security

- **NextAuth.js:** Secures user onboarding via Google OAuth.
- **Session Management:** Utilizes HttpOnly, secure cookies for session persistence, protecting against XSS token theft.
- **User Isolation:** Multi-tenant architecture where every SQL query is explicitly scoped to the authenticated `user_id` injected from the trusted server session.
- **Data Protection:** Parameterised database queries prevent SQL injection, and Zod schemas enforce type-safety on all inputs.

---

## Deployment

SmartSpend is architected for cloud-native, serverless deployment:
- **Vercel Hosting:** The Next.js application is deployed to Vercel, leveraging Edge and Serverless functions for scalable API routing and SSR.
- **Database Architecture:** Connected to a highly available **TiDB Cloud** distributed database, utilizing TLSv1.2 encryption for all network transit.

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

## Getting Started

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

*Note: Environment variables for database connectivity, NextAuth, Google OAuth, and Gemini API keys are required for the application to function. See `.env.example`.*

---

## Future Roadmap

- **Banking Integrations:** Implement Plaid or generic Open Banking APIs for direct, real-time transaction ingestion.
- **Predictive Analytics:** Utilize historical time-series data to forecast end-of-month cash flow and anticipate budget overruns.
- **Advanced Anomaly Detection:** Flag irregular spending patterns or duplicate subscriptions using statistical variance modeling.

---

## Author

**Karthik Nair**  
*Computer Science Undergraduate*  
Backend Engineering • Cloud Computing • Distributed Systems • AI-Powered Applications

- [GitHub](https://github.com/Karthik00769)
- [LinkedIn](https://linkedin.com/in/karthiknair)
- [Email](mailto:contact@example.com)

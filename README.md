<div align="center">
  <h1>💰 SmartSpend</h1>
  <p><strong>AI-powered personal finance platform that helps users track spending, manage budgets, analyze financial behavior, and make better money decisions.</strong></p>

  <p>
    <a href="#demo-section"><img src="https://img.shields.io/badge/Demo-Live_Now-success?style=for-the-badge&logo=vercel" alt="Live Demo"/></a>
    <a href="https://github.com/yourusername/smartspend/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License"/></a>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Built_with-Next.js-black?style=for-the-badge&logo=next.js" alt="Next.js"/></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
    <a href="https://pingcap.com/tidb/"><img src="https://img.shields.io/badge/Database-TiDB-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="TiDB"/></a>
  </p>
</div>

<br />

---

## 📖 Table of Contents

1. [Project Vision](#1-project-vision)
2. [Problem Statement](#2-problem-statement)
3. [Why SmartSpend Exists](#3-why-smartspend-exists)
4. [Key Features](#4-key-features)
5. [Feature Showcase](#5-feature-showcase)
6. [Architecture Overview](#6-architecture-overview)
7. [System Design](#7-system-design)
8. [Multi-Tenant Design](#8-multi-tenant-design)
9. [Authentication Flow](#9-authentication-flow)
10. [AI Architecture](#10-ai-architecture)
11. [Receipt Processing Pipeline](#11-receipt-processing-pipeline)
12. [Financial Insights Engine](#12-financial-insights-engine)
13. [Database Design](#13-database-design)
14. [Entity Relationship Diagram](#14-entity-relationship-diagram)
15. [Security Architecture](#15-security-architecture)
16. [Data Lifecycle](#16-data-lifecycle)
17. [Account Deletion Architecture](#17-account-deletion-architecture)
18. [Scalability Considerations](#18-scalability-considerations)
19. [Technology Stack](#19-technology-stack)
20. [Folder Structure](#20-folder-structure)
21. [Local Development Setup](#21-local-development-setup)
22. [Environment Variables](#22-environment-variables)
23. [Deployment](#23-deployment)
24. [Future Roadmap](#24-future-roadmap)
25. [Lessons Learned](#25-lessons-learned)
26. [Engineering Decisions](#26-engineering-decisions)
27. [Screenshots Section](#27-screenshots-section)
28. [Demo Section](#28-demo-section)
29. [License](#29-license)

---

## 1. Project Vision
SmartSpend aims to democratize financial intelligence. We envision a world where anyone, regardless of financial literacy, can access enterprise-grade analytics and AI-powered insights to manage their personal economy effectively. Our vision is to eliminate the cognitive load of budgeting through automation, machine learning, and intuitive design.

## 2. Problem Statement
Personal finance is notoriously tedious. Users are forced to choose between highly manual, spreadsheet-like interfaces that require hours of data entry, or overly simplistic apps that lack the depth required to make meaningful financial decisions. Furthermore, modern financial tools often compromise user privacy, lack strict data isolation, and struggle with the complexities of multi-currency processing and unstructured receipt data.

## 3. Why SmartSpend Exists
SmartSpend was built from the ground up to solve the friction of financial tracking by leveraging Generative AI and a highly secure, multi-tenant architecture. 

It exists to provide:
* **Frictionless Data Entry:** Through AI-driven OCR receipt parsing.
* **Proactive Intelligence:** Moving beyond retroactive reporting to predictive budget warnings and actionable insights.
* **Uncompromising Security:** Ensuring that personal financial data is strictly isolated, cryptographically verified, and immutably audited.

## 4. Key Features
* **Intelligent Expense Tracking:** Log expenses manually or upload receipts for automated OCR extraction.
* **Dynamic Budget Management:** Set contextual spending limits and receive real-time alerts before overspending occurs.
* **Lifecycle Savings Goals:** Define financial targets, contribute incrementally, and track your journey to completion.
* **AI-Powered Financial Insights:** Generate personalized recommendations and behavioral analytics based on your unique spending patterns.
* **Multi-Currency Support:** Seamlessly manage finances across borders without dealing with floating-point conversion errors.
* **Immutable Audit Trails:** Maintain complete transparency with compliance-grade activity logs.
* **Zero-Trust Authentication:** Secure Google login backed by continuous session validation.

## 5. Feature Showcase

| Feature | Description | Engineering Highlights |
| :--- | :--- | :--- |
| **Receipt Intelligence** | Upload photos or PDFs; AI extracts the merchant, date, and amount. | Utilizes Google Gemini Vision API; built-in confidence scoring. |
| **Budget Enforcement** | Category-level spending limits with progress visualizations. | Aggregation queries executed directly in TiDB for sub-millisecond response. |
| **Goal Tracking** | Savings targets that adapt to your monthly income and savings rate. | Deterministic fractional math to prevent rounding errors. |
| **Activity Auditing** | A historical ledger of every critical state change in the system. | Immutable append-only logging tables. |

## 6. Architecture Overview
SmartSpend is built on a modern, serverless ecosystem. The frontend is heavily optimized for Core Web Vitals using Next.js App Router, while the backend leverages serverless API routes connected to a distributed, MySQL-compatible TiDB database. The architecture is designed to scale horizontally and globally.

## 7. System Design

### Request Lifecycle
```mermaid
sequenceDiagram
    participant Client as Web Client
    participant Edge as Vercel Edge Network
    participant API as Next.js API Routes
    participant Auth as NextAuth / GCP
    participant DB as TiDB (Database)
    participant AI as Gemini Service

    Client->>Edge: HTTPS Request
    Edge->>API: Route to Serverless Function
    API->>Auth: Validate JWT / Session
    Auth-->>API: Authorized User Info
    API->>DB: Query Scoped Data (WHERE user_id = ?)
    DB-->>API: Row Data
    opt If AI Processing Required
        API->>AI: Send Prompt / Payload
        AI-->>API: Return Structured JSON
    end
    API-->>Edge: Formatted Response
    Edge-->>Client: Render UI
```

## 8. Multi-Tenant Design
In SaaS applications, multi-tenancy is the architecture where a single instance of the software serves multiple customers (tenants). In SmartSpend, every individual user operates as a distinct tenant.

**Why it matters:** 
Financial data is highly sensitive. A failure in data isolation could result in a user viewing another user's bank transactions or budgets, leading to catastrophic privacy breaches.

**How we enforce it:**
* **Database Level:** Every entity table (`expenses`, `budgets`, `goals`, `categories`, `insights`, `audit_logs`, `expense_audit_log`, `bank_accounts`, `bank_transactions`, `statement_uploads`, `receipt_uploads`, `receipt_extractions`) features a mandatory `user_id` foreign key.
* **Application Level:** Every database query explicitly requires the `user_id` derived securely from the authenticated server-side session. There are zero "global" queries executed on behalf of a user.

## 9. Authentication Flow
SmartSpend implements a robust, Zero-Trust authentication model utilizing NextAuth and Google OAuth.

### Authentication Lifecycle
1. **OAuth Verification:** Users authenticate securely via Google Cloud Platform.
2. **Session Generation:** NextAuth generates an encrypted JWT session cookie.
3. **Zero-Trust Validation:** On *every protected request*, the backend decrypts the JWT and queries the database to verify the user account is still active, undeleted, and hasn't had its session version revoked.

```mermaid
graph TD
    Start[User Login Attempt] --> Google[Google OAuth Consent]
    Google -->|Callback| NextAuth[NextAuth Provider]
    NextAuth --> DBCheck{User Exists?}
    DBCheck -->|No| CreateUser[Insert User Record]
    DBCheck -->|Yes| UpdateLogin[Update Last Login]
    CreateUser --> IssueJWT[Issue Encrypted JWT]
    UpdateLogin --> IssueJWT
    IssueJWT --> Authenticated((Authenticated State))
```

## 10. AI Architecture
The AI infrastructure is separated from deterministic financial calculations. We use Large Language Models (LLMs) strictly for unstructured data extraction and natural language recommendations, while the core business logic relies entirely on deterministic TypeScript and SQL.

## 11. Receipt Processing Pipeline
Users can upload images or PDFs of receipts and bank statements. The system processes these unstructured files to automatically categorize and log expenses.

```mermaid
graph LR
    Upload[File Upload] --> Validator[Mime Type & Size Validation]
    Validator --> Buffer[In-Memory Buffer]
    Buffer --> Vision[Gemini Vision API]
    Vision --> Extractor[JSON Structure Extraction]
    Extractor --> Sanitizer[Sanitize Amounts & Dates]
    Sanitizer --> DB[Insert into TiDB]
```

**The Pipeline:**
1. **Upload:** User provides a receipt image or PDF.
2. **Validation:** The application verifies file integrity without persisting to disk.
3. **AI Vision:** The binary buffer is sent directly to Google Gemini's multimodal endpoint.
4. **Structured Output:** The prompt forces the LLM to return strict JSON containing the `Merchant`, `Date`, `Amount`, and `Confidence Score`.
5. **Persistence:** The parsed data is displayed for user confirmation before being inserted into the database.

## 12. Financial Insights Engine
The Financial Insights Engine runs asynchronously to evaluate user behavior.

**Data Analyzed:**
* Trailing 30-day spending patterns.
* Category utilization vs. defined Budgets.
* Savings velocity vs. Goal deadlines.

The engine aggregates this data and passes the raw metrics to the AI, which generates personalized, actionable recommendations (e.g., "You are spending 40% more on Dining this week. Consider cooking at home to stay within your $500 budget.")

## 13. Database Design
A critical engineering decision was how to store currency. **Floating point numbers are never used for currency in SmartSpend.**

**Minor Units Strategy:**
All monetary values are stored as integers representing the currency's minor unit (e.g., cents or paise). 
* `₹100.50` is stored as `10050`.
* `$500.00` is stored as `50000`.

**Fields using this pattern:**
* `amount_minor`
* `target_minor`
* `saved_minor`
* `limit_minor`
* `monthly_income_minor`

**Why?** This entirely prevents precision loss and rounding errors typical of IEEE 754 floating-point math, guaranteeing 100% financial correctness.

## 14. Entity Relationship Diagram
The schema is highly normalized and relational, designed for strong referential integrity.

```mermaid
erDiagram
    USERS ||--o{ EXPENSES : "owns"
    USERS ||--o{ BUDGETS : "owns"
    USERS ||--o{ GOALS : "owns"
    USERS ||--o{ CATEGORIES : "owns"
    USERS ||--o{ INSIGHTS : "owns"
    USERS ||--o{ AUDIT_LOGS : "owns"
    USERS ||--o{ BANK_ACCOUNTS : "owns"
    BANK_ACCOUNTS ||--o{ BANK_TRANSACTIONS : "contains"
    
    USERS {
        string id PK
        string email
        string name
        datetime created_at
    }
    
    EXPENSES {
        string id PK
        string user_id FK
        string category_id FK
        int amount_minor
        datetime date
    }
    
    BUDGETS {
        string id PK
        string user_id FK
        string category_id FK
        int limit_minor
    }
    
    AUDIT_LOGS {
        string id PK
        string user_id FK
        string action
        json metadata
    }
```
*(Diagram simplified for readability; all child entities inherit from `USERS`)*

## 15. Security Architecture
* **Strict Foreign Keys:** Preventing orphaned data.
* **Immutable Auditing:** The `audit_logs` and `expense_audit_log` tables record every creation, modification, and deletion of sensitive data. Financial applications require an immutable paper trail for trust and potential compliance.
* **Server-Side Validation:** Form inputs are validated on the client, but aggressively re-validated on the server using Zod schemas.

## 16. Data Lifecycle
SmartSpend treats user data with the utmost privacy. Users have absolute control over their data footprint. When a user requests to delete their account, the application ensures complete, immediate, and gapless erasure of their identity and financial history.

## 17. Account Deletion Architecture
Previously, account deletion required complex application-level orchestration (deleting child records in a specific order within a transaction). This approach is inherently risky; if a new table is added but forgotten in the deletion script, orphaned data remains.

**The Solution: Database-Enforced Cascades**
SmartSpend utilizes `ON DELETE CASCADE` at the database level. 

```mermaid
graph TD
    UserReq[User Requests Deletion] --> API[Next.js API Route]
    API --> SQL[DELETE FROM users WHERE id = ?]
    SQL --> DB[(TiDB Executing Cascade)]
    DB -.-> DropExp[Delete Expenses]
    DB -.-> DropCat[Delete Categories]
    DB -.-> DropBudg[Delete Budgets]
    DB -.-> DropGoal[Delete Goals]
    DB -.-> DropAudit[Delete Audit Logs]
    DB -.-> DropBank[Delete Bank Data]
    DB -.-> DropUploads[Delete Upload Artifacts]
    DB --> Complete[Data Completely Erased]
    API --> Logout[Invalidate JWT Session]
```

**Why this is safer:**
By running a single `DELETE FROM users WHERE id = ?` command, we delegate referential cleanup to the database engine. The database automatically cascades the deletion down to every child table (`expenses`, `receipt_uploads`, `insights`, etc.). This guarantees 100% cleanup, eliminates application-layer transaction bottlenecks, and ensures future schema additions are automatically handled via their foreign key constraints.

## 18. Scalability Considerations
* **Serverless Compute:** Vercel automatically scales Edge and Node.js functions infinitely based on traffic.
* **Distributed Database:** TiDB abstracts sharding and scaling, allowing MySQL compatibility with NoSQL-like scale.
* **Statelessness:** The application is entirely stateless. Sessions are JWT-based, and file uploads are processed entirely in memory, eliminating the need for complex persistent volume management.

## 19. Technology Stack
* **Framework:** Next.js (App Router)
* **Language:** TypeScript
* **Styling:** TailwindCSS + Radix UI Primitives
* **Database:** TiDB (MySQL Compatible)
* **ORM / Query Builder:** Raw SQL with parameterized queries for maximum performance and security.
* **Authentication:** NextAuth.js
* **AI Provider:** Google Gemini API

## 20. Folder Structure
```text
smartspend/
├── app/                  # Next.js 14+ App Router (API and Page routes)
├── components/           # Modular React components
│   ├── layouts/          # Page wrappers (Sidebar, Navigation)
│   ├── sections/         # Feature-specific components (Goals, Expenses)
│   └── ui/               # Reusable UI primitives (Buttons, Inputs)
├── context/              # React Context providers (Auth, Global State)
├── docs/                 # Extensive architectural documentation
├── hooks/                # Custom React hooks
├── lib/                  # Core Business Logic
│   ├── ai/               # Gemini API wrappers and prompt engineering
│   ├── auth/             # NextAuth configuration
│   ├── db/               # Database connection pools and schemas
│   └── finance/          # Deterministic financial calculators
└── services/             # Database access and abstraction layer
```

## 21. Local Development Setup

### Prerequisites
* Node.js 18.x or later
* MySQL 8.0+ or TiDB Local instance
* Google Cloud Platform account (for OAuth)
* Google Gemini API Key

### Installation
1. Clone the repository:
```bash
git clone https://github.com/yourusername/smartspend.git
cd smartspend
```

2. Install dependencies:
```bash
npm install
```

## 22. Environment Variables
Create a `.env.local` file in the project root:

```env
# Application URL
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Security
NEXTAUTH_SECRET=generate_a_strong_random_string

# Database
# Connect to your local or remote TiDB/MySQL instance
DATABASE_URL=mysql://root:password@127.0.0.1:4000/smartspend

# Google OAuth
GOOGLE_CLIENT_ID=your_gcp_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_gcp_client_secret

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key
```

## 23. Deployment
SmartSpend is architected for zero-config deployment on Vercel.

1. Push your code to a GitHub repository.
2. Import the project in the Vercel Dashboard.
3. Configure your Environment Variables in the Vercel deployment settings.
4. Click **Deploy**. Vercel will automatically detect the Next.js framework and configure the build settings.

## 24. Future Roadmap
* **Automated Bank Sync:** Integration with Plaid/Tink to securely pull transactions directly from banking institutions.
* **Collaborative Budgets:** Allow multiple users (e.g., family members) to share and contribute to joint budgets and goals.
* **Advanced Investment Tracking:** Expand the core engine to track equities, cryptocurrencies, and retirement portfolios.
* **Mobile Application:** Port the web experience to iOS and Android using React Native / Expo.

## 25. Lessons Learned
* **AI is non-deterministic; Finances are deterministic.** We learned quickly that relying on an LLM to perform math leads to hallucinations. We restructured the architecture so the AI only performs unstructured data extraction (OCR), passing the raw numbers into a strictly typed, deterministic TypeScript calculation engine.
* **Serverless PDF Parsing is Hard.** Native Node.js libraries for PDF parsing often rely on Canvas binaries that exceed serverless deployment limits or fail cross-platform compilation. We pivoted to sending PDF byte streams directly to Gemini's Multimodal API, offloading the heavy lifting.

## 26. Engineering Decisions

### 1. Raw SQL vs. ORM (Prisma/Drizzle)
* **Chosen:** Raw SQL with parameterized queries.
* **Why:** For a financial application requiring complex aggregations, window functions, and strict indexing control, ORMs often generate suboptimal queries. Raw SQL provides complete control over the execution plan and avoids the overhead of a heavy Prisma engine in a serverless environment.
* **Tradeoff:** Slower development speed and manual TypeScript interface maintenance for database rows.

### 2. TiDB Serverless over PostgreSQL
* **Chosen:** TiDB.
* **Why:** TiDB provides a highly scalable, distributed SQL database that is MySQL compatible. Its serverless offering handles sudden spikes in traffic without manual provisioning, perfect for a modern web application.
* **Tradeoff:** MySQL syntax lacks some advanced PostgreSQL features (like native Array types), requiring us to store certain metadata as JSON strings.

### 3. Database Cascades over Application Cleanup
* **Chosen:** `ON DELETE CASCADE`.
* **Why:** Guarantees 100% referential integrity during account deletion without relying on application-layer transactions.
* **Tradeoff:** Accidental deletions are catastrophic and unrecoverable. We mitigate this with strict UI confirmations and audit logging.

## 27. Screenshots Section

> *(Replace these placeholders with actual screenshots of your application)*

| Dashboard | Expense Entry |
|:---:|:---:|
| <img src="https://via.placeholder.com/600x400?text=Dashboard+View" alt="Dashboard" width="100%"/> | <img src="https://via.placeholder.com/600x400?text=Expense+Form" alt="Expense Form" width="100%"/> |

| Budget Tracking | AI Insights |
|:---:|:---:|
| <img src="https://via.placeholder.com/600x400?text=Budget+Tracker" alt="Budget" width="100%"/> | <img src="https://via.placeholder.com/600x400?text=AI+Insights" alt="Insights" width="100%"/> |

## 28. Demo Section

Experience the platform live. 

[![Live Demo](https://img.shields.io/badge/Launch-Live_Demo-success?style=for-the-badge&logo=vercel)](#)

*(Insert a GIF or short video walkthrough here showcasing the core user journey from login to receipt upload).*

## 29. License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
<div align="center">
  <p>Engineered with precision for the modern web.</p>
</div>

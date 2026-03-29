# SmartSpend Architecture Documentation

SmartSpend is a SaaS-style personal finance tracking application designed to help users monitor expenses, allocate budgets based on targets and track savings goals dynamically with smart financial scoring triggers.

---

## 🏗️ 1. Frontend Architecture

The frontend uses **Next.js 15+ (App Router)** providing server-rendered performance with lightweight client transitions.

### 🧬 Tech Stack
*   **Framework:** Next.js (React 19)
*   **Type Safety:** TypeScript
*   **Styling:** Tailwind CSS + Radix UI primitives
*   **Visual Data Maps:** Recharts (responsive context layouts)
*   **Forms & Validation:** React Hook Form + Zod (centralised `lib/validation/schemas.ts`)

### 📂 Directory Routing Structure
*   **`/app`**
    *   `/(auth)`: Centred Authentication Shells (Login, Signup).
    *   `/(app)`: Authenticated contexts container shells rendering `Dashboard`, `Expenses`, `Budgets`, `Goals`, `Insights`.
*   **`/context`**
    *   `AuthContext.tsx`: Lifecycle monitoring session identity hooks.
    *   `FinanceContext.tsx`: Dashboard summary aggregators, tracking KPI slices async safely.
*   **`/components`**
    *   `/layout`: Modular Desktop sidebar navigation and Mobile bottom bars layouts securely.
    *   `/ui`: Standard form primitive boundaries rendering layouts cleanly.

---

## 🛠️ 2. Backend & API Services

SmartSpend leverages **Next.js API routes** acting directly as a lightweight Node.js middleware layer connecting controllers directly to services.

### 🧩 Service Layer
Service aggregate modules map SQL queries directly avoiding direct client connection pooling directly inside page components:
*   **`services/expense.service.ts`**: Handles validation insertion batches mapped to relational bounds.
*   **`services/budget.service.ts`**: Idempotent upserts controlling allocated threshold filters correctly.
*   **`services/goal.service.ts`**: Performs deadline remaining duration triggers computations computing triggers bounds mappings.

### 📬 Endpoint map
*   `GET /api/analytics`: Unified data payloads fetching dashboard aggregators.
*   `GET /api/insights/engine`: Computes absolute trends directly directly triggering calculation rules.
*   `POST /api/expenses`: Multi-pipeline pipelines running validations auto-detect mappings setups cleanly.

---

## 🗄️ 3. Database & Storage Schema

Uses **MySQL relational tables** with standard connection pooling provided via `lib/db.ts` wrapper mapped across core tables:

| Table | Details |
| :--- | :--- |
| **`users`** | ID mappings, emails hash passwords salt configurations. |
| **`categories`** | Core templates bounds mapping icon labels constraints. |
| **`expenses`** | Transaction row items mapped to amount category descriptors. |
| **`budgets`** | Monthly category caps allocated threshold markers. |
| **`goals`** | Savings metrics targets, deadline maps constraints triggers. |
| **`insights`** | Stored advice rows mapped by analytics rules triggers algorithms. |

---

## 🧠 4. Analytics & Insight Engine

The analytics pipeline executes computed aggregates aggregating queries dynamically responding to thresholds layout triggers:

### 📈 Expense Aggregation
*   **WoW/MoM calculations**: Loops transaction date headers dividing aggregate metrics sums compared with prior ranges offsets securely.
*   **Threshold Trigger thresholds triggers limits computations**: Flag maps budgets buffers computing spent buffers compared against limits percentage benchmarks.

### 💡 Insight Generation Pipeline
Runs a multi-algorithm pass calculation rule:
1.  Loads user aggregate stats data context structures.
2.  Passes constraints into rules loop filters setup:
    *   *If spent percentage exceeds 100% → Create alert notification buffer.*
    *   *If daily averages multipliers outpace threshold → Forecast goal at risk warning.*
3.  Hydrates static advice output into standard layout response maps securely securely setups layouts correctly setups securely properly setups nicely setup properly.

---

## 🐳 5. Infrastructure - Docker Ready

SmartSpend uses standard agnostic frameworks supported running containerised Docker buffers efficiently setups cleanly:

### 🚢 container sizing alignment maps
*   **Multi-stage configurations setup securely**: Next.js Standalone builders securely building optimal cached layers size bounds containers.
*   **Relational container boundaries mappings**: Runs MySQL natively inside container boundary sharing internal network binds securely securely variables setups layout safely securely.
*   **Dynamic configuration adapters maps**: Node mapped variables read mapped to host network contexts trigger securely properly setups nicely setup properly.

---

*Updated: March 2026*

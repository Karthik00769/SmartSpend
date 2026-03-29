# SmartSpend — API Reference & Examples

> All responses are wrapped in `{ ok: true, data: … }` on success, or `{ ok: false, error: "…", details: { field: ["…"] } }` on failure.  
> The `userId` param/field defaults to `"1"` (demo user) if omitted.

---

## 📦 Endpoint Map

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/expenses` | List expenses (paginated, filterable) |
| `POST` | `/api/expenses` | Add a new expense |
| `GET`  | `/api/budgets` | Monthly budgets with live spend totals |
| `POST` | `/api/budgets` | Create/update a category budget (upsert) |
| `GET`  | `/api/goals` | List savings goals with progress metrics |
| `POST` | `/api/goals` | Create a new savings goal |
| `GET`  | `/api/insights` | Fetch AI insights (notification panel) |
| `PATCH`| `/api/insights` | Mark all insights as read |
| `POST` | `/api/insights/generate` | Trigger rules engine for current month |
| `GET`  | `/api/dashboard` | Full dashboard payload (KPIs + charts) |
| `GET`  | `/api/reports` | Monthly trend data (income vs expenses) |
| `GET`  | `/api/categories` | All expense categories (system + custom) |

---

## 💸 Expenses

### GET /api/expenses

Fetches a paginated list of expenses for a user.

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `userId` | string | `"1"` | User ID (multi-user isolation) |
| `year` | number | — | Filter by year (e.g. `2026`) |
| `month` | number | — | Filter by month `1–12` |
| `limit` | number | `50` | Max rows to return (max `200`) |

```bash
# All expenses for the current user
curl http://localhost:3000/api/expenses?userId=1

# March 2026 only, page of 20
curl "http://localhost:3000/api/expenses?userId=1&year=2026&month=3&limit=20"
```

**✅ Success response**
```json
{
  "ok": true,
  "data": {
    "count": 2,
    "expenses": [
      {
        "id": "12",
        "userId": "1",
        "categoryId": 1,
        "categoryName": "Food & Dining",
        "categoryIcon": "🍔",
        "amount": 45.99,
        "date": "2026-03-13",
        "description": "Coffee and croissant",
        "source": "manual",
        "createdAt": "2026-03-13T05:00:00.000Z"
      }
    ]
  }
}
```

---

### POST /api/expenses

Creates a new expense and returns the saved row.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryId` | number | ✅ | ID from `/api/categories` |
| `amount` | number | ✅ | Positive decimal (`> 0`) |
| `date` | string | ✅ | `YYYY-MM-DD` format |
| `description` | string | — | Max 500 characters |
| `source` | string | — | `manual` \| `receipt_scan` \| `bank_import` |
| `userId` | string | — | Defaults to demo user `"1"` |

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 1,
    "amount": 24.99,
    "date": "2026-03-13",
    "description": "Coffee at Starbucks",
    "source": "manual"
  }'
```

**✅ Success response (201)**
```json
{
  "ok": true,
  "data": {
    "expense": {
      "id": "42",
      "categoryName": "Food & Dining",
      "categoryIcon": "🍔",
      "amount": 24.99,
      "date": "2026-03-13",
      "source": "manual"
    }
  }
}
```

**❌ Validation error (400)**
```json
{
  "ok": false,
  "error": "Validation failed — see \"details\" for field-level errors.",
  "details": {
    "amount": ["Must be a positive number"],
    "date": ["Must be a date in YYYY-MM-DD format"]
  }
}
```

---

## 💰 Budgets

### GET /api/budgets

Returns all budget rows for a month with real-time spend amounts computed via SQL join.

```bash
# Current month budgets
curl "http://localhost:3000/api/budgets?userId=1"

# Specific month
curl "http://localhost:3000/api/budgets?userId=1&year=2026&month=3"
```

**✅ Success response**
```json
{
  "ok": true,
  "data": {
    "totalBudget": 2200,
    "totalSpent": 629.47,
    "categories": [
      {
        "id": 3,
        "categoryId": 5,
        "category": "Shopping",
        "icon": "🛍️",
        "color": "#EC4899",
        "allocated": 400,
        "spent": 200,
        "usedPct": 50,
        "isOverBudget": false,
        "remaining": 200,
        "month": 3,
        "year": 2026
      }
    ]
  }
}
```

---

### POST /api/budgets

Creates or updates (`UPSERT`) a category budget for a period. Returns the full updated summary.

```bash
curl -X POST http://localhost:3000/api/budgets \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 1,
    "limitAmount": 500,
    "month": 3,
    "year": 2026
  }'
```

> [!TIP]
> This is always an upsert — calling it twice with the same `(userId, categoryId, month, year)` just updates the `limitAmount`. Safe to call from a "Set Budget" form on every submit.

---

## 🎯 Goals

### GET /api/goals

Returns active goals sorted by priority (high → medium → low) then soonest deadline.  
All progress metrics (`completionPct`, `daysRemaining`, `requiredDailySavings`) are computed in SQL.

```bash
curl "http://localhost:3000/api/goals?userId=1&status=active"
```

**✅ Success response**
```json
{
  "ok": true,
  "data": {
    "count": 2,
    "goals": [
      {
        "id": 1,
        "title": "Emergency Fund",
        "targetAmount": 10000,
        "currentAmount": 3500,
        "deadline": "2026-12-31",
        "priority": "high",
        "status": "active",
        "completionPct": 35.0,
        "daysRemaining": 293,
        "requiredDailySavings": 22.15
      }
    ]
  }
}
```

---

### POST /api/goals

```bash
curl -X POST http://localhost:3000/api/goals \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New MacBook",
    "targetAmount": 2500,
    "targetDate": "2026-09-01",
    "priority": "medium",
    "description": "M4 Pro upgrade"
  }'
```

**❌ Missing required field (400)**
```json
{
  "ok": false,
  "error": "Validation failed — see \"details\" for field-level errors.",
  "details": {
    "title": ["Title is required"],
    "targetDate": ["Required"]
  }
}
```

---

## 💡 Insights

### GET /api/insights

Fetches up to 20 insights: unread first, newest first.

```bash
# All insights (last 90 days)
curl "http://localhost:3000/api/insights?userId=1"

# Unread only (for notification badge)
curl "http://localhost:3000/api/insights?userId=1&unreadOnly=true"
```

**✅ Success response**
```json
{
  "ok": true,
  "data": {
    "unreadCount": 3,
    "insights": [
      {
        "id": 1,
        "type": "overspending_alert",
        "content": "You've used 93% of your monthly income this month.",
        "metadata": { "pct": 93, "spent": 4650, "income": 5000 },
        "isRead": false,
        "month": 3,
        "year": 2026,
        "createdAt": "2026-03-13T05:00:00.000Z",
        "minutesAgo": 42
      }
    ]
  }
}
```

---

### PATCH /api/insights — Mark all read

```bash
curl -X PATCH http://localhost:3000/api/insights \
  -H "Content-Type: application/json" \
  -d '{ "userId": "1" }'
```

**✅ Response**
```json
{ "ok": true, "data": { "markedRead": 3 } }
```

---

### POST /api/insights/generate — Run rules engine

```bash
curl -X POST http://localhost:3000/api/insights/generate \
  -H "Content-Type: application/json" \
  -d '{ "userId": "1" }'
```

**✅ Response**
```json
{
  "ok": true,
  "data": {
    "message": "Generated 2 new insight(s) for 3/2026.",
    "created": 2,
    "month": 3,
    "year": 2026
  }
}
```

> [!IMPORTANT]
> This endpoint is **idempotent** — calling it multiple times in the same month won't create duplicates. Add it to a Vercel Cron Job: `0 9 * * *` (daily at 9am).

---

## 🗂️ File Structure

```
smartspend/
├── types/
│   ├── index.ts              ← Frontend domain types (unchanged)
│   └── api.ts                ← All API DTOs + request/response types   ✨NEW
│
├── lib/
│   ├── db.ts                 ← mysql2 connection pool
│   ├── api-response.ts       ← ok() / fail() response helpers           ✨NEW
│   └── validate.ts           ← Zod schemas + parseBody/parseQuery        ✨NEW
│
├── services/
│   ├── expense.service.ts    ← listExpenses, createExpense, summaries   ✨NEW
│   ├── budget.service.ts     ← listBudgets, upsertBudget                ✨NEW
│   ├── goal.service.ts       ← listGoals, createGoal, updateProgress    ✨NEW
│   └── insight.service.ts    ← fetchInsights, markAllRead, rules engine ✨NEW
│
└── app/api/
    ├── expenses/route.ts     ← GET + POST (Zod + service)               ✨UPDATED
    ├── budgets/route.ts      ← GET + POST (Zod + service)               ✨UPDATED
    ├── goals/route.ts        ← GET + POST (Zod + service)               ✨UPDATED
    ├── insights/
    │   ├── route.ts          ← GET + PATCH (Zod + service)              ✨UPDATED
    │   └── generate/route.ts ← POST — rules engine trigger              ✨NEW
    ├── dashboard/route.ts    ← Composite KPI response
    ├── reports/route.ts      ← Monthly trend data
    └── categories/route.ts   ← System + custom categories
```

---

## 🔗 Using from Frontend

```typescript
// Typed fetch helper for consuming the { ok, data } envelope
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res  = await fetch(path, init);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data as T;
}

// Usage
const { expenses } = await apiFetch<{ expenses: ExpenseDTO[] }>(
  '/api/expenses?userId=1&year=2026&month=3'
);

// POST example
const { expense } = await apiFetch<{ expense: ExpenseDTO }>('/api/expenses', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ categoryId: 1, amount: 12.5, date: '2026-03-13' }),
});
```

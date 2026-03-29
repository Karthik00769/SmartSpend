# SmartSpend — Database Schema Notes

> See `schema.sql` in the project root for the full DDL.

## Tables

| Table | Purpose |
|---|---|
| `users` | Multi-tenant anchor. Every row in every other table must have `user_id` matching `users.id`. |
| `categories` | Seed data (8 system categories). Users cannot delete system categories. |
| `expenses` | Core transaction ledger. Indexed on `(user_id, expense_date)`. |
| `budgets` | One row per `(user_id, category_id, budget_month, budget_year)`. Unique constraint enforces single budget per category per month. |
| `goals` | Savings targets. `status` can be `active | paused | completed | cancelled`. |
| `insights` | AI-generated advice cards. Idempotent per `(user_id, insight_type, month, year)`. |

## Key Indexes

```sql
-- Fast monthly expense roll-ups
INDEX idx_expenses_user_date (user_id, expense_date)

-- Dashboard chart queries
INDEX idx_expenses_category    (user_id, category_id)

-- Insight deduplication
UNIQUE KEY uq_insight_period (user_id, insight_type, generated_for_month, generated_for_year)
```

## Multi-Tenancy

Every SQL query in the service layer includes `WHERE user_id = ?` as the first filter.
The `user_id` value flows from:

```
Client request (query param / body)
  → Zod schema validation (lib/validate.ts)
  → API route handler
  → service function parameter
  → SQL WHERE clause
```

**Never** trust a userId that arrives without being validated through Zod first.

## Saved Query Patterns

### Monthly expense roll-up
```sql
SELECT COALESCE(SUM(amount), 0) AS total_spent
FROM expenses
WHERE user_id = ?
  AND YEAR(expense_date)  = ?
  AND MONTH(expense_date) = ?
```

### Budget vs Actual (one query)
```sql
SELECT b.category_id,
       c.name,
       b.limit_amount,
       COALESCE(SUM(e.amount), 0) AS spent
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN expenses e
  ON e.category_id = b.category_id
 AND e.user_id     = b.user_id
 AND YEAR(e.expense_date)  = b.budget_year
 AND MONTH(e.expense_date) = b.budget_month
WHERE b.user_id     = ?
  AND b.budget_year  = ?
  AND b.budget_month = ?
GROUP BY b.category_id, c.name, b.limit_amount
```

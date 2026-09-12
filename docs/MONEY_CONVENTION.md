# Money Convention - SmartSpend

## Canonical Standard

**All monetary values flow as MINOR UNITS (paise) through the entire stack until final display.**

```
┌─────────────┐
│  DATABASE   │ ← Store: minor units (paise)
└──────┬──────┘
       │
┌──────▼──────┐
│  SERVICES   │ ← Process: minor units
└──────┬──────┘
       │
┌──────▼──────┐
│   APIS      │ ← Transport: minor units (*Minor fields)
└──────┬──────┘
       │
┌──────▼──────┐
│ COMPONENTS  │ ← Receive: minor units
└──────┬──────┘
       │
┌──────▼──────┐
│   fmt()     │ ← CONVERT: minor ÷ 100 → INR
└──────┬──────┘
       │
┌──────▼──────┐
│  DISPLAY    │ ← Show: ₹20,460
└─────────────┘
```

---

## Why Minor Units?

1. **Precision:** No floating-point errors in calculations
2. **Consistency:** One conversion point (formatter only)
3. **Database:** Already stores in minor units
4. **Calculations:** All financial math uses integers

---

## Database Schema

All amount columns use `bigint` and store **minor units** (paise):

```sql
expenses.amount_minor     -- 2046000 = ₹20,460
goals.target_minor        -- 50000 = ₹500
goals.saved_minor         -- 45000 = ₹450
budgets.limit_minor       -- 500000 = ₹5,000
users.monthly_income_minor -- 10000000 = ₹100,000
```

**Conversion:**
- INR to minor: `amount * 100`
- Minor to INR: `amount / 100`

---

## Service Layer

All service functions work with **minor units**:

```typescript
// ✅ CORRECT
export async function createExpense(amountMinor: number) {
  await query('INSERT INTO expenses (amount_minor) VALUES (?)', [amountMinor]);
}

// ❌ WRONG
export async function createExpense(amountInr: number) {
  const minor = amountInr * 100; // Don't convert here
  await query('INSERT INTO expenses (amount_minor) VALUES (?)', [minor]);
}
```

**Helper Functions:**
```typescript
import { Math as FinanceMath } from '@/lib/finance';

// Only use at API boundary (user input)
const minor = FinanceMath.inrToMinor(userInput); // 500 → 50000

// Never use in responses (let fmt() handle it)
const inr = FinanceMath.minorToInr(dbValue); // ❌ Don't do this
```

---

## API Layer

All API responses use `*Minor` field naming:

```typescript
// ✅ CORRECT - Dashboard API
return ok({
  stats: {
    totalSpentMinor: 2046000,
    savingsMinor: 500000,
    budgetRemainingMinor: 300000
  }
});

// ✅ CORRECT - Goals API
return ok({
  goals: [{
    targetMinor: 50000,
    savedMinor: 45000,
    progressPct: 90
  }]
});

// ❌ WRONG - Don't convert in API
return ok({
  stats: {
    totalSpent: FinanceMath.minorToInr(2046000), // 20460 ❌
  }
});
```

**Naming Convention:**
- `amountMinor` - Raw database value
- `targetMinor` - Goal target amount
- `savedMinor` - Goal saved amount
- `spentMinor` - Expense amount
- `allocatedMinor` - Budget allocation
- `incomeMinor` - Income amount

---

## Component Layer

Components receive **minor units** and pass directly to formatter:

```typescript
// ✅ CORRECT
interface DashboardData {
  totalSpentMinor: number;
  savingsMinor: number;
}

export function Dashboard({ data, fmt }: Props) {
  return (
    <div>
      <p>Spent: {fmt(data.totalSpentMinor)}</p>
      <p>Saved: {fmt(data.savingsMinor)}</p>
    </div>
  );
}

// ❌ WRONG - Don't convert in component
export function Dashboard({ data, fmt }: Props) {
  const spentInr = data.totalSpentMinor / 100; // ❌
  return <p>Spent: {fmt(spentInr)}</p>;
}
```

---

## Formatter Layer

**ONLY** the `fmt()` function performs conversion:

```typescript
// hooks/use-currency.ts
const fmt = useCallback(
  (amountMinor: number) => {
    const amountMajor = amountMinor / 100;  // Convert here ONLY
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amountMajor);
  },
  [currencyCode],
);
```

**Usage:**
```typescript
fmt(50000)     // → "₹500"
fmt(2046000)   // → "₹20,460"
fmt(100)       // → "₹1"
```

---

## Examples

### ✅ CORRECT: Full Flow

```typescript
// 1. User input (₹500)
const userInput = 500;

// 2. API converts to minor
const amountMinor = FinanceMath.inrToMinor(userInput); // 50000

// 3. Service stores minor
await createExpense({ amount_minor: amountMinor });

// 4. API returns minor
const expenses = await query('SELECT amount_minor FROM expenses');
return ok({ expenses }); // [{ amount_minor: 50000 }]

// 5. Component receives minor
const total = expenses.reduce((sum, e) => sum + e.amount_minor, 0); // 50000

// 6. Display with fmt
<p>{fmt(total)}</p> // "₹500" ✅
```

### ❌ WRONG: Double Conversion (Old Reports Bug)

```typescript
// 1. Database has 2046000
const expenses = await query('SELECT amount_minor FROM expenses');

// 2. API converts to INR ❌
return ok({
  expenses: expenses.map(e => ({
    amount: FinanceMath.minorToInr(e.amount_minor) // 20460
  }))
});

// 3. Component sums INR values
const total = data.reduce((sum, e) => sum + e.amount, 0); // 20460

// 4. fmt divides by 100 AGAIN ❌
<p>{fmt(total)}</p> // "₹204.6" ❌ WRONG (should be ₹20,460)
```

---

## API Boundary Checklist

### Input (User → System)

**✅ DO:** Convert at API entry point
```typescript
// API route handler
const body = await req.json();
const amountMinor = FinanceMath.inrToMinor(body.amount);
await service.create({ amountMinor });
```

**❌ DON'T:** Convert in service layer
```typescript
// Service function
export async function create(amountInr: number) {
  const minor = amountInr * 100; // ❌ Wrong layer
}
```

### Output (System → User)

**✅ DO:** Return minor units with `*Minor` naming
```typescript
return ok({
  expense: {
    amountMinor: 50000
  }
});
```

**❌ DON'T:** Convert to INR in API
```typescript
return ok({
  expense: {
    amount: FinanceMath.minorToInr(50000) // ❌ Let fmt() handle this
  }
});
```

---

## Common Mistakes

### Mistake 1: Converting Too Early
```typescript
// ❌ WRONG
const expenses = await getExpenses();
return ok({
  total: FinanceMath.minorToInr(expenses.total)
});

// ✅ CORRECT
const expenses = await getExpenses();
return ok({
  totalMinor: expenses.total
});
```

### Mistake 2: Converting in Components
```typescript
// ❌ WRONG
const display = (data.amountMinor / 100).toFixed(2);

// ✅ CORRECT
const display = fmt(data.amountMinor);
```

### Mistake 3: Mixed Naming
```typescript
// ❌ WRONG - Ambiguous
interface Stats {
  spent: number;  // Is this minor or INR?
}

// ✅ CORRECT - Clear naming
interface Stats {
  spentMinor: number;  // Definitely minor units
}
```

---

## Migration Guide

If you find code that converts too early:

1. **Remove premature conversion:**
   ```typescript
   - income: FinanceMath.minorToInr(value),
   + incomeMinor: value,
   ```

2. **Update component to use *Minor fields:**
   ```typescript
   - const total = data.reduce((sum, item) => sum + item.income, 0);
   + const total = data.reduce((sum, item) => sum + item.incomeMinor, 0);
   ```

3. **Verify display uses fmt():**
   ```typescript
   <p>{fmt(total)}</p> // ✅ Correct
   ```

4. **Test:**
   - Database: 2046000 minor
   - Expected display: ₹20,460
   - NOT: ₹204.6 or ₹20460.00

---

## Testing

```typescript
describe('Money Convention', () => {
  it('should display correct amount without double conversion', () => {
    const dbValue = 2046000; // From database
    
    // API should return minor
    const apiResponse = { amountMinor: dbValue };
    expect(apiResponse.amountMinor).toBe(2046000);
    
    // Component should sum minor
    const total = apiResponse.amountMinor;
    expect(total).toBe(2046000);
    
    // fmt should convert once
    const display = fmt(total);
    expect(display).toBe('₹20,460');
  });
});
```

---

## Enforcement

1. **Code Review:** Check for premature `minorToInr()` calls
2. **Naming:** All API fields must use `*Minor` suffix
3. **Type Safety:** Use TypeScript to enforce conventions
4. **Testing:** Verify end-to-end with known values

---

## Summary

**ONE RULE:** Convert minor → INR only in `fmt()`, nowhere else.

**Memory Aid:** If you see `÷ 100` or `minorToInr()` anywhere except `fmt()`, it's probably wrong.

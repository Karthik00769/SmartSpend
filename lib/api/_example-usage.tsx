/**
 * lib/api/_example-usage.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Example React component demonstrating the full API layer.
 *
 * This file is for reference ONLY — not imported by any page.
 * Copy the patterns you need into your own hooks or components.
 *
 * Covers:
 *   ✓ getExpenses / createExpense
 *   ✓ getBudgets  / upsertBudget
 *   ✓ getGoals    / createGoal
 *   ✓ getInsights / markInsightsRead
 *   ✓ getAnalytics (dashboard bundle)
 *   ✓ ApiRequestError handling (field-level + generic)
 */
'use client';

import { useState, useEffect } from 'react';
import {
  // Analytics
  getAnalytics,
  // Expenses
  getExpenses,
  createExpense,
  // Budgets
  getBudgets,
  upsertBudget,
  // Goals
  getGoals,
  createGoal,
  // Insights
  getInsights,
  markInsightsRead,
  // Error class
  ApiRequestError,
} from '@/lib/api';

import type { ExpenseDTO, GoalDTO, BudgetSummaryDTO, InsightDTO } from '@/types/api';
import type { AnalyticsBundle } from '@/lib/api/analyticsApi';

// ─── 1. Fetching analytics (Dashboard example) ────────────────────────────────

function DashboardExample() {
  const [bundle,  setBundle]  = useState<AnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAnalytics();          // current month auto-resolved
        setBundle(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p>Loading analytics…</p>;
  if (error)   return <p className="text-red-500">{error}</p>;
  if (!bundle) return null;

  return (
    <div>
      <h2>Dashboard — {bundle.period.label}</h2>
      <p>Total Spent: ${bundle.summary.totalSpent}</p>
      <p>Savings:     ${bundle.summary.savings}</p>
      <p>Transactions: {bundle.summary.transactionCount}</p>
    </div>
  );
}

// ─── 2. Adding an expense (Add Expense page example) ─────────────────────────

function AddExpenseExample() {
  const [status,     setStatus]     = useState<'idle' | 'loading' | 'done'>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setFieldErrors({});
    setErrorMsg(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const result = await createExpense({
        amount:      Number(data.get('amount')),
        date:        String(data.get('date')),
        description: String(data.get('description')),
        category:    'Other',
      });

      console.log('Created expense:', result.expenseId);
      console.log('Auto-categorized:', result.autoCategized);
      console.log('Category:', result.categorization.categoryName);

      setStatus('done');
      form.reset();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        // Field-level Zod errors
        if (err.details && Object.keys(err.details).length > 0) {
          setFieldErrors(err.details);
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg('Unexpected error. Please try again.');
      }
      setStatus('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <input name="amount" type="number" step="0.01" placeholder="Amount" required />
        {fieldErrors.amount && (
          <p className="text-red-500 text-sm">{fieldErrors.amount[0]}</p>
        )}
      </div>

      <div>
        <input name="date" type="date" required />
        {fieldErrors.date && (
          <p className="text-red-500 text-sm">{fieldErrors.date[0]}</p>
        )}
      </div>

      <input name="description" type="text" placeholder="Description (for auto-categorization)" />

      {errorMsg && <p className="text-red-500">{errorMsg}</p>}
      {status === 'done' && <p className="text-green-600">Expense added!</p>}

      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Saving…' : 'Add Expense'}
      </button>
    </form>
  );
}

// ─── 3. Budget management ─────────────────────────────────────────────────────

function BudgetExample() {
  const [summary, setSummary] = useState<BudgetSummaryDTO | null>(null);

  useEffect(() => {
    getBudgets().then(setSummary).catch(console.error);
  }, []);

  async function handleSetLimit(categoryId: number, limitAmount: number) {
    try {
      const updated = await upsertBudget({
        category:    'Food',
        amount:      limitAmount,
        month: new Date().getMonth() + 1,
        year:  new Date().getFullYear(),
      });
      setSummary(updated);
    } catch (err) {
      console.error('Failed to update budget:', err);
    }
  }

  return (
    <div>
      <h2>Budget Overview — ${summary?.totalSpent ?? 0} / ${summary?.totalBudget ?? 0}</h2>
      {summary?.categories.map(cat => (
        <div key={cat.categoryId} className="flex justify-between items-center py-2">
          <span>{cat.icon} {cat.category}</span>
          <span className={cat.isOverBudget ? 'text-red-500' : 'text-green-600'}>
            ${cat.spent.toFixed(0)} / ${cat.allocated.toFixed(0)}
          </span>
          <button onClick={() => handleSetLimit(cat.categoryId, cat.allocated + 50)}>
            +$50
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── 4. Goals list + create ───────────────────────────────────────────────────

function GoalsExample() {
  const [goals, setGoals] = useState<GoalDTO[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getGoals().then(res => setGoals(res.goals)).catch(console.error);
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const { goal } = await createGoal({
        title:        'Vacation Fund',
        targetAmount: 3000,
        deadline:     '2026-12-31',
      });
      setGoals(prev => [...prev, goal]);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        alert(err.message);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h2>My Goals</h2>
      {goals.map(g => (
        <div key={g.id} className="py-2 border-b">
          <p className="font-semibold">{g.title}</p>
          <p className="text-sm text-gray-500">
            ${g.currentAmount} / ${g.targetAmount} — {g.completionPct.toFixed(1)}%
          </p>
          <p className="text-xs">
            {g.daysRemaining} days left · Save ${g.requiredDailySavings?.toFixed(2)}/day
          </p>
        </div>
      ))}
      <button onClick={handleCreate} disabled={creating}>
        {creating ? 'Creating…' : '+ Add Goal'}
      </button>
    </div>
  );
}

// ─── 5. Insights notifications ────────────────────────────────────────────────

function InsightsExample() {
  const [insights, setInsights] = useState<InsightDTO[]>([]);
  const [unread,   setUnread]   = useState(0);

  useEffect(() => {
    getInsights()
      .then(res => { setInsights(res.insights); setUnread(res.unreadCount); })
      .catch(console.error);
  }, []);

  async function handleMarkAllRead() {
    try {
      const { markedRead } = await markInsightsRead();
      console.log(`Marked ${markedRead} as read`);
      setUnread(0);
      setInsights(prev => prev.map(i => ({ ...i, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2>Insights {unread > 0 && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">{unread}</span>}</h2>
        {unread > 0 && (
          <button onClick={handleMarkAllRead}>Mark all read</button>
        )}
      </div>
      {insights.map(insight => (
        <div key={insight.id} className={`py-2 ${insight.isRead ? 'opacity-60' : 'font-medium'}`}>
          <p>{insight.content}</p>
          <p className="text-xs text-gray-400">{insight.minutesAgo}m ago</p>
        </div>
      ))}
    </div>
  );
}

// ─── Combined demo page (remove before production) ───────────────────────────

export default function ApiLayerDemo() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-12">
      <h1 className="text-3xl font-bold">API Layer Demo</h1>
      <section><DashboardExample /></section>
      <section><AddExpenseExample /></section>
      <section><BudgetExample /></section>
      <section><GoalsExample /></section>
      <section><InsightsExample /></section>
    </div>
  );
}

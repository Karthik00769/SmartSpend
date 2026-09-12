'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';
import { apiGet, apiPatch, apiDelete, buildQuery, ApiRequestError } from '@/lib/api-client';
import { formatDateIST, formatIST, nowIST } from '@/lib/time/time.service';
import type { ExpenseDTO } from '@/types/api';
import * as FinanceCore from '@/lib/finance';
import { useSmartSpend } from '@/context/smartspend-context';

const SOURCE_META: Record<string, { label: string; emoji: string; cls: string }> = {
  manual: { label: 'Manual', emoji: '✏️', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  receipt_scan: { label: 'OCR', emoji: '📸', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  bank_import: { label: 'Bank', emoji: '🏦', cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.manual;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full source-badge ${meta.cls}`}>
      <span>{meta.emoji}</span>{meta.label}
    </span>
  );
}

interface Category { id: number; label: string; icon: string; }

interface EditState {
  amount: string;
  description: string;
  categoryName: string;
  categoryId: string;
  date: string;
}

// EditRow: manual source → category dropdown, auto/OCR/bank → free text
function EditRow({ expense, categories, onSave, onCancel, saving }: {
  expense: ExpenseDTO;
  categories: Category[];
  onSave: (id: string, patch: EditState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EditState>({
    amount: String(FinanceCore.Math.minorToInr(expense.amountMinor)),
    description: expense.description,
    categoryName: expense.categoryName,
    categoryId: String(expense.categoryId ?? ''),
    date: expense.date,
  });

  const set = (k: keyof EditState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const isManual = !expense.source || expense.source === 'manual';

  return (
    <TableRow className="bg-primary/5 border-l-2 border-primary">
      <TableCell className="text-xs text-muted-foreground">
        {formatIST(new Date(expense.createdAt), 'datetime')}
      </TableCell>

      <TableCell>
        {isManual ? (
          <Select
            value={form.categoryId}
            onValueChange={v => {
              const cat = categories.find(c => String(c.id) === v);
              setForm(p => ({ ...p, categoryId: v, categoryName: cat?.label ?? p.categoryName }));
            }}
          >
            <SelectTrigger className="h-8 text-sm w-40 border-primary/40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <span className="mr-1">{c.icon}</span>{c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={form.categoryName}
            onChange={set('categoryName')}
            className="h-8 text-sm w-36 border-primary/40"
            placeholder="Category"
          />
        )}
      </TableCell>

      <TableCell>
        <Input value={form.description} onChange={set('description')}
          className="h-8 text-sm w-48" placeholder="Description" />
      </TableCell>
      <TableCell>
        <Input type="date" value={form.date} onChange={set('date')} className="h-8 text-sm w-36" />
      </TableCell>
      <TableCell><SourceBadge source={expense.source} /></TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')}
          className="h-8 text-sm w-24 text-right font-semibold ml-auto" />
      </TableCell>
      <TableCell>
        <div className="flex gap-1.5 justify-end">
          <Button size="sm" className="h-7 px-3 text-xs" disabled={saving}
            onClick={() => onSave(expense.id, form)}>
            {saving ? '…' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function MobileEditCard({ expense, categories, onSave, onCancel, saving }: {
  expense: ExpenseDTO;
  categories: Category[];
  onSave: (id: string, patch: EditState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EditState>({
    amount: String(FinanceCore.Math.minorToInr(expense.amountMinor)),
    description: expense.description,
    categoryName: expense.categoryName,
    categoryId: String(expense.categoryId ?? ''),
    date: expense.date,
  });

  const set = (k: keyof EditState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const isManual = !expense.source || expense.source === 'manual';
  const { symbol } = useSmartSpend();

  return (
    <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/5 flex flex-col gap-3 shadow-sm animate-in fade-in zoom-in-95 duration-200">
      <div className="flex gap-2">
        {isManual ? (
          <Select
            value={form.categoryId}
            onValueChange={v => {
              const cat = categories.find(c => String(c.id) === v);
              setForm(p => ({ ...p, categoryId: v, categoryName: cat?.label ?? p.categoryName }));
            }}
          >
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <span className="mr-1">{c.icon}</span>{c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={form.categoryName} onChange={set('categoryName')} className="h-9 flex-1" placeholder="Category" />
        )}
        <Input type="date" value={form.date} onChange={set('date')} className="h-9 w-32 shrink-0 text-xs" />
      </div>
      <Input value={form.description} onChange={set('description')} className="h-9" placeholder="Description" />
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-muted-foreground">{symbol}</span>
        <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} className="h-10 text-lg font-bold flex-1" />
      </div>
      <div className="flex gap-2 justify-end mt-1">
        <Button size="sm" variant="outline" className="h-9 flex-1" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-9 flex-1" disabled={saving} onClick={() => onSave(expense.id, form)}>
          {saving ? '…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;

export default function ExpensesHistoryPage() {
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [source, setSource] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dbSearch, setDbSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Restore UI state
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedExpenses, setDeletedExpenses] = useState<ExpenseDTO[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState<string | null>(null);

  const { fmt } = useSmartSpend();

  useEffect(() => {
    apiGet<{ categories: Category[] }>('/api/categories')
      .then(d => setCategories(d.categories ?? []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setDbSearch(search); setPage(0); }, 350);
  }, [search]);

  useEffect(() => { setPage(0); }, [startDate, endDate, minAmount, maxAmount, source, catFilter]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = buildQuery({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: dbSearch || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
        source: source || undefined,
        categoryId: catFilter ? Number(catFilter) : undefined,
      });
      const data = await apiGet<{ expenses: ExpenseDTO[]; total: number }>(`/api/expenses${qs}`);
      setExpenses(data.expenses);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  }, [page, dbSearch, startDate, endDate, minAmount, maxAmount, source, catFilter]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleSave = async (id: string, patch: EditState) => {
    setSavingId(id);
    try {
      const exp = expenses.find(e => e.id === id);
      const isManual = !exp?.source || exp.source === 'manual';
      await apiPatch(`/api/expenses/${id}`, {
        amount: parseFloat(patch.amount),
        description: patch.description,
        date: patch.date,
        ...(isManual && patch.categoryId
          ? { categoryId: Number(patch.categoryId) }
          : { categoryName: patch.categoryName }),
      });
      setEditingId(null);
      fetchExpenses();
    } catch (err: any) { alert(err.message || 'Save failed.'); }
    finally { setSavingId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense? It will be hidden from all views.')) return;
    setDeletingId(id);
    try { await apiDelete(`/api/expenses/${id}`); fetchExpenses(); }
    catch (err: any) { alert(err.message || 'Delete failed.'); }
    finally { setDeletingId(null); }
  };

  const fetchDeletedExpenses = async () => {
    setDeletedLoading(true);
    try {
      const qs = buildQuery({ deleted: true, limit: 100 });
      const data = await apiGet<{ expenses: ExpenseDTO[]; total: number }>(`/api/expenses${qs}`);
      setDeletedExpenses(data.expenses);
    } catch (err) {
      console.error('Failed to load deleted expenses:', err);
    } finally {
      setDeletedLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await apiGet(`/api/expenses/${id}/restore`, { method: 'POST' });
      setRestoreConfirmId(null);
      fetchDeletedExpenses();
      fetchExpenses();
    } catch (err: any) {
      alert(err.message || 'Restore failed.');
    } finally {
      setRestoringId(null);
    }
  };

  const clearFilters = () => {
    setSearch(''); setStartDate(''); setEndDate('');
    setMinAmount(''); setMaxAmount(''); setSource(''); setCatFilter(''); setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Calculate summary statistics for print
  const totalAmount = expenses.reduce((sum, exp) => sum + exp.amountMinor, 0);
  const categoryBreakdown = expenses.reduce((acc, exp) => {
    if (!acc[exp.categoryName]) {
      acc[exp.categoryName] = { icon: exp.categoryIcon, amount: 0, count: 0 };
    }
    acc[exp.categoryName].amount += exp.amountMinor;
    acc[exp.categoryName].count += 1;
    return acc;
  }, {} as Record<string, { icon: string; amount: number; count: number }>);

  const filtersApplied = [
    search && `Search: "${search}"`,
    startDate && `From: ${startDate}`,
    endDate && `To: ${endDate}`,
    minAmount && `Min: ${fmt(FinanceCore.Math.inrToMinor(parseFloat(minAmount)))}`,
    maxAmount && `Max: ${fmt(FinanceCore.Math.inrToMinor(parseFloat(maxAmount)))}`,
    source && `Source: ${SOURCE_META[source]?.label || source}`,
    catFilter && `Category: ${categories.find(c => String(c.id) === catFilter)?.label || catFilter}`,
  ].filter(Boolean);

  return (
    <div className="space-y-6">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Expense History</h1>
          <p className="text-muted-foreground text-sm">{total} transaction{total !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="gap-2 no-print">
          🖨️ Print
        </Button>
      </div>

      <Card className="p-5 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
            <Input placeholder="Search description or category…" className="pl-9 h-10"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <Select value={source || 'all'} onValueChange={v => { setSource(v === 'all' ? '' : v); setPage(0); }}>
            <SelectTrigger className="h-10"><SelectValue placeholder="All sources" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="manual">✏️ Manual</SelectItem>
              <SelectItem value="receipt_scan">📸 OCR / Receipt</SelectItem>
              <SelectItem value="bank_import">🏦 Bank Import</SelectItem>
            </SelectContent>
          </Select>

          <Select value={catFilter || 'all'} onValueChange={v => { setCatFilter(v === 'all' ? '' : v); setPage(0); }}>
            <SelectTrigger className="h-10"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <span className="mr-1">{c.icon}</span>{c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2 sm:col-span-2">
            <Input type="date" className="h-10 text-sm flex-1" value={startDate}
              onChange={e => setStartDate(e.target.value)} />
            <span className="flex items-center text-muted-foreground text-sm px-1">to</span>
            <Input type="date" className="h-10 text-sm flex-1" value={endDate}
              onChange={e => setEndDate(e.target.value)} />
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <Input type="number" min="0" step="0.01" placeholder="Min $" className="h-10 text-sm flex-1"
              value={minAmount} onChange={e => setMinAmount(e.target.value)} />
            <Input type="number" min="0" step="0.01" placeholder="Max $" className="h-10 text-sm flex-1"
              value={maxAmount} onChange={e => setMaxAmount(e.target.value)} />
            <Button variant="ghost" className="h-10 px-3 text-muted-foreground shrink-0"
              onClick={clearFilters} title="Clear all filters">✕</Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border">
        {error && (
          <div className="p-4 bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium border-b">
            ⚠️ {error}
          </div>
        )}

        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <Table className="expense-table">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[110px]">Added</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead className="w-[100px]">Source</TableHead>
                <TableHead className="text-right w-[100px]">Amount</TableHead>
                <TableHead className="w-[90px] no-print" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                [...Array(4)].map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded"></div></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-muted animate-pulse rounded-full"></div>
                        <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
                      </div>
                    </TableCell>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded"></div></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded"></div></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full"></div></TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto"></div></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              )}
              {!loading && expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 py-8">
                    <EmptyState
                      title="No expenses found"
                      description="Try adjusting your filters or date range."
                      icon="💸"
                      className="border-none shadow-none bg-transparent"
                    />
                  </TableCell>
                </TableRow>
              )}
              {!loading && expenses.map(exp =>
                editingId === exp.id ? (
                  <EditRow
                    key={exp.id}
                    expense={exp}
                    categories={categories}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                    saving={savingId === exp.id}
                  />
                ) : (
                  <TableRow key={exp.id} className="hover:bg-muted/30 transition-colors group">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatIST(new Date(exp.createdAt), 'datetime')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span>{exp.categoryIcon}</span>
                        <div className="min-w-0">
                          <span className="font-medium text-sm">{exp.categoryName}</span>
                          {exp.description && (
                            <span className="text-xs text-muted-foreground ml-1">({exp.description})</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="truncate block text-sm text-muted-foreground">{exp.description || '—'}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{exp.date}</TableCell>
                    <TableCell><SourceBadge source={exp.source} /></TableCell>
                    <TableCell className="text-right font-bold tabular-nums amount">
                      {fmt(exp.amountMinor)}
                    </TableCell>
                    <TableCell className="no-print">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => setEditingId(exp.id)}
                          className="text-xs px-2 py-1 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                          title="Edit">✏️</button>
                        <button onClick={() => handleDelete(exp.id)}
                          disabled={deletingId === exp.id}
                          className="text-xs px-2 py-1 rounded bg-muted hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50"
                          title="Delete">{deletingId === exp.id ? '…' : '🗑️'}</button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              )}
              {!loading && expenses.length > 0 && (
                <TableRow className="totals-row">
                  <TableCell colSpan={5} className="text-right font-bold">Total (Current Page):</TableCell>
                  <TableCell className="text-right font-bold tabular-nums amount">{fmt(totalAmount)}</TableCell>
                  <TableCell className="no-print" />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden flex flex-col divide-y divide-border/40">
          {loading && (
            <div className="p-4">
              <ListSkeleton />
            </div>
          )}
          {!loading && expenses.length === 0 && (
            <div className="p-4">
              <EmptyState
                title="No expenses found"
                description="Try adjusting your filters."
                icon="💸"
                className="border-none shadow-none bg-transparent"
              />
            </div>
          )}
          {!loading && expenses.map(exp =>
            editingId === exp.id ? (
              <div key={exp.id} className="p-3">
                <MobileEditCard
                  expense={exp}
                  categories={categories}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                  saving={savingId === exp.id}
                />
              </div>
            ) : (
              <div key={exp.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col gap-2 relative group">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-lg shrink-0">
                      {exp.categoryIcon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate text-sm">
                        {exp.categoryName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {exp.description || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-foreground tabular-nums text-sm">
                      {fmt(exp.amountMinor)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {exp.date}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-1">
                  <SourceBadge source={exp.source} />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(exp.id)}
                      className="text-xs w-8 h-8 flex items-center justify-center rounded-lg bg-muted/50 hover:bg-primary/10 hover:text-primary transition-colors active:scale-95"
                      title="Edit">✏️</button>
                    <button onClick={() => handleDelete(exp.id)}
                      disabled={deletingId === exp.id}
                      className="text-xs w-8 h-8 flex items-center justify-center rounded-lg bg-muted/50 hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50 active:scale-95"
                      title="Delete">{deletingId === exp.id ? '…' : '🗑️'}</button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 no-print">
            <span className="text-xs text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0}
                onClick={() => setPage((p: number) => p - 1)}>← Prev</Button>
              <span className="text-xs text-muted-foreground px-1">{page + 1} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1}
                onClick={() => setPage((p: number) => p + 1)}>Next →</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Deleted Expenses Section */}
      <div className="no-print">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            onClick={() => {
              setShowDeleted(!showDeleted);
              if (!showDeleted) fetchDeletedExpenses();
            }}
            className="gap-2"
          >
            {showDeleted ? '▼' : '▶'} Deleted Expenses ({deletedExpenses.length})
          </Button>
        </div>

        {showDeleted && (
          <Card className="overflow-hidden border border-red-200 dark:border-red-800">
            <div className="bg-red-50 dark:bg-red-950/30 p-4 border-b border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                🗑️ These expenses have been deleted and are hidden from all reports and calculations.
              </p>
            </div>

            {deletedLoading ? (
              <div className="p-4">
                <ListSkeleton />
              </div>
            ) : deletedExpenses.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p>No deleted expenses found.</p>
              </div>
            ) : (
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead>Deleted At</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="text-right w-[100px]">Amount</TableHead>
                      <TableHead className="w-[90px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedExpenses.map(exp => (
                      <TableRow key={exp.id} className="opacity-60 hover:opacity-100 transition-opacity">
                        <TableCell className="text-xs text-muted-foreground">
                          {formatIST(new Date(exp.deletedAt!), 'datetime')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span>{exp.categoryIcon}</span>
                            <span className="font-medium text-sm">{exp.categoryName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="truncate block text-sm text-muted-foreground">
                            {exp.description || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{exp.date}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {fmt(exp.amountMinor)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRestoreConfirmId(exp.id)}
                            disabled={restoringId === exp.id}
                            className="text-xs h-7 px-2"
                          >
                            {restoringId === exp.id ? '...' : '↻ Restore'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Mobile view for deleted */}
            <div className="md:hidden divide-y divide-border/40">
              {deletedExpenses.map(exp => (
                <div key={exp.id} className="p-4 opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-lg shrink-0">
                        {exp.categoryIcon}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate text-sm">
                          {exp.categoryName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {exp.description || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-foreground tabular-nums text-sm">
                        {fmt(exp.amountMinor)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{exp.date}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-red-600 dark:text-red-400">
                      Deleted: {formatIST(new Date(exp.deletedAt!), 'date')}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRestoreConfirmId(exp.id)}
                      disabled={restoringId === exp.id}
                      className="text-xs h-7 px-2"
                    >
                      {restoringId === exp.id ? '...' : '↻ Restore'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {restoreConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 no-print"
          onClick={() => setRestoreConfirmId(null)}>
          <Card className="max-w-md w-full p-6 animate-in zoom-in-95 fade-in duration-200"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Restore Expense?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will restore the expense and make it visible in all reports and calculations again.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRestoreConfirmId(null)}>
                Cancel
              </Button>
              <Button onClick={() => handleRestore(restoreConfirmId)} disabled={restoringId === restoreConfirmId}>
                {restoringId === restoreConfirmId ? 'Restoring...' : 'Restore'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

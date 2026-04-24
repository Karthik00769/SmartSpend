'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card }   from '@/components/ui/card';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { apiGet, apiPatch, apiDelete, buildQuery, ApiRequestError } from '@/lib/api-client';
import { format } from 'date-fns';
import type { ExpenseDTO } from '@/types/api';

const SOURCE_META: Record<string, { label: string; emoji: string; cls: string }> = {
  manual:       { label: 'Manual', emoji: '✏️', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  receipt_scan: { label: 'OCR',    emoji: '📸', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  bank_import:  { label: 'Bank',   emoji: '🏦', cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.manual;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.cls}`}>
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
  expense:    ExpenseDTO;
  categories: Category[];
  onSave:     (id: string, patch: EditState) => Promise<void>;
  onCancel:   () => void;
  saving:     boolean;
}) {
  const [form, setForm] = useState<EditState>({
    amount:       String(expense.amount),
    description:  expense.description,
    categoryName: expense.categoryName,
    categoryId:   String(expense.categoryId ?? ''),
    date:         expense.date,
  });

  const set = (k: keyof EditState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const isManual = !expense.source || expense.source === 'manual';

  return (
    <TableRow className="bg-primary/5 border-l-2 border-primary">
      <TableCell className="text-xs text-muted-foreground">
        {format(new Date(expense.createdAt), 'MMM dd, HH:mm')}
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

const PAGE_SIZE = 25;

export default function ExpensesHistoryPage() {
  const [expenses,   setExpenses]   = useState<ExpenseDTO[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [minAmount,  setMinAmount]  = useState('');
  const [maxAmount,  setMaxAmount]  = useState('');
  const [source,     setSource]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dbSearch,   setDbSearch]   = useState('');
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [savingId,   setSavingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ categories: Category[] }>('/api/categories')
      .then(d => setCategories(d.categories ?? []))
      .catch(() => {});
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
        limit:      PAGE_SIZE,
        offset:     page * PAGE_SIZE,
        search:     dbSearch   || undefined,
        startDate:  startDate  || undefined,
        endDate:    endDate    || undefined,
        minAmount:  minAmount  ? Number(minAmount) : undefined,
        maxAmount:  maxAmount  ? Number(maxAmount) : undefined,
        source:     source     || undefined,
        categoryId: catFilter  ? Number(catFilter) : undefined,
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
        amount:      parseFloat(patch.amount),
        description: patch.description,
        date:        patch.date,
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

  const clearFilters = () => {
    setSearch(''); setStartDate(''); setEndDate('');
    setMinAmount(''); setMaxAmount(''); setSource(''); setCatFilter(''); setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
        <div className="overflow-x-auto">
          <Table>
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
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <span className="animate-spin inline-block mr-2">⌛</span>Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No expenses found. Try adjusting your filters.
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
                      {format(new Date(exp.createdAt), 'MMM dd, HH:mm')}
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
                    <TableCell className="text-right font-bold tabular-nums">
                      ${exp.amount.toFixed(2)}
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
            </TableBody>
          </Table>
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
    </div>
  );
}

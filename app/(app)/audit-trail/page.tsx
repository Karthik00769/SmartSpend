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
import { apiGet, buildQuery } from '@/lib/api-client';
import { formatIST } from '@/lib/time/time.service';
import * as FinanceCore from '@/lib/finance';
import { useSmartSpend } from '@/context/smartspend-context';

interface AuditLogEntry {
  id: number;
  expense_id: number;
  user_id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  old_values: any;
  new_values: any;
  summary: string | null;
  reason: string | null;
  entry_hash: string;
  created_at: string;
  expense_description?: string;
}

const OPERATION_STYLES: Record<string, { label: string; cls: string; emoji: string }> = {
  CREATE: { label: 'Created', cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300', emoji: '➕' },
  UPDATE: { label: 'Updated', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', emoji: '✏️' },
  DELETE: { label: 'Deleted', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', emoji: '🗑️' },
  RESTORE: { label: 'Restored', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300', emoji: '↻' },
};

function OperationBadge({ operation }: { operation: string }) {
  const style = OPERATION_STYLES[operation] || OPERATION_STYLES.CREATE;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${style.cls}`}>
      <span>{style.emoji}</span>{style.label}
    </span>
  );
}

function ChangeDetails({ old_values, new_values, operation }: { old_values: any; new_values: any; operation: string }) {
  const { fmt } = useSmartSpend();

  if (!old_values && !new_values) return <span className="text-muted-foreground text-xs">—</span>;

  if (operation === 'CREATE') {
    return (
      <div className="text-xs space-y-1">
        {new_values?.amount_minor && (
          <div><span className="text-muted-foreground">Amount:</span> {fmt(new_values.amount_minor)}</div>
        )}
        {new_values?.description && (
          <div><span className="text-muted-foreground">Description:</span> {new_values.description}</div>
        )}
      </div>
    );
  }

  if (operation === 'DELETE') {
    return (
      <div className="text-xs space-y-1 opacity-60">
        {old_values?.amount_minor && (
          <div><span className="text-muted-foreground">Amount:</span> {fmt(old_values.amount_minor)}</div>
        )}
        {old_values?.description && (
          <div><span className="text-muted-foreground">Description:</span> {old_values.description}</div>
        )}
      </div>
    );
  }

  if (operation === 'UPDATE' && old_values && new_values) {
    const changes: { field: string; from: string; to: string }[] = [];

    if (old_values.amount_minor !== new_values.amount_minor) {
      changes.push({
        field: 'Amount',
        from: fmt(old_values.amount_minor),
        to: fmt(new_values.amount_minor),
      });
    }

    if (old_values.description !== new_values.description) {
      changes.push({
        field: 'Description',
        from: old_values.description || '—',
        to: new_values.description || '—',
      });
    }

    if (old_values.category_id !== new_values.category_id) {
      changes.push({
        field: 'Category',
        from: `ID ${old_values.category_id}`,
        to: `ID ${new_values.category_id}`,
      });
    }

    if (old_values.expense_date !== new_values.expense_date) {
      changes.push({
        field: 'Date',
        from: old_values.expense_date,
        to: new_values.expense_date,
      });
    }

    return (
      <div className="text-xs space-y-1">
        {changes.map((change, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-muted-foreground font-semibold w-20">{change.field}:</span>
            <span className="opacity-60 line-through">{change.from}</span>
            <span>→</span>
            <span className="font-semibold">{change.to}</span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-muted-foreground text-xs">No changes</span>;
}

const PAGE_SIZE = 50;

export default function AuditTrailPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [operation, setOperation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dbSearch, setDbSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setDbSearch(search); setPage(0); }, 350);
  }, [search]);

  useEffect(() => { setPage(0); }, [operation, startDate, endDate]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: dbSearch || undefined,
        operation: operation || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      const data = await apiGet<{ entries: AuditLogEntry[]; total: number }>(`/api/expenses/audit${qs}`);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit trail.');
    } finally {
      setLoading(false);
    }
  }, [page, dbSearch, operation, startDate, endDate]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const clearFilters = () => {
    setSearch('');
    setOperation('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Audit Trail</h1>
          <p className="text-muted-foreground text-sm">
            Immutable record of all expense changes • {total} entr{total !== 1 ? 'ies' : 'y'}
          </p>
        </div>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
            <Input
              placeholder="Search summary or expense ID…"
              className="pl-9 h-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Select value={operation || 'all'} onValueChange={v => setOperation(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All operations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All operations</SelectItem>
              <SelectItem value="CREATE">➕ Created</SelectItem>
              <SelectItem value="UPDATE">✏️ Updated</SelectItem>
              <SelectItem value="DELETE">🗑️ Deleted</SelectItem>
              <SelectItem value="RESTORE">↻ Restored</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2 items-center">
            <Button variant="ghost" className="h-10 px-3 text-muted-foreground" onClick={clearFilters} title="Clear filters">
              ✕
            </Button>
          </div>

          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Input
              type="date"
              className="h-10 text-sm flex-1"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              placeholder="Start date"
            />
            <span className="flex items-center text-muted-foreground text-sm px-1">to</span>
            <Input
              type="date"
              className="h-10 text-sm flex-1"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              placeholder="End date"
            />
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
                <TableHead className="w-[140px]">Timestamp</TableHead>
                <TableHead className="w-[100px]">Operation</TableHead>
                <TableHead className="w-[90px]">Expense ID</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-[100px]">Actor</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                [...Array(5)].map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded"></div></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full"></div></TableCell>
                    <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded"></div></TableCell>
                    <TableCell><div className="h-4 w-48 bg-muted animate-pulse rounded"></div></TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded"></div></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              )}
              {!loading && entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-48">
                    <EmptyState
                      title="No audit entries found"
                      description="Try adjusting your filters."
                      icon="📋"
                      className="border-none shadow-none bg-transparent"
                    />
                  </TableCell>
                </TableRow>
              )}
              {!loading && entries.map(entry => (
                <>
                  <TableRow
                    key={entry.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatIST(new Date(entry.created_at), 'datetime')}
                    </TableCell>
                    <TableCell>
                      <OperationBadge operation={entry.operation} />
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      #{entry.expense_id}
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <span className="text-sm truncate block">
                        {entry.summary || entry.expense_description || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate">
                      {entry.user_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        {expandedId === entry.id ? '▼' : '▶'}
                      </button>
                    </TableCell>
                  </TableRow>
                  {expandedId === entry.id && (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={6} className="p-4">
                        <div className="space-y-3 max-w-3xl">
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Changes
                            </span>
                            <div className="mt-2 p-3 bg-background rounded-lg border">
                              <ChangeDetails
                                old_values={entry.old_values}
                                new_values={entry.new_values}
                                operation={entry.operation}
                              />
                            </div>
                          </div>
                          {entry.reason && (
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Reason
                              </span>
                              <div className="mt-1 text-sm">{entry.reason}</div>
                            </div>
                          )}
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Hash
                            </span>
                            <div className="mt-1 text-xs font-mono text-muted-foreground break-all">
                              {entry.entry_hash}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-xs text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                ← Prev
              </Button>
              <span className="text-xs text-muted-foreground px-1">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="text-xs text-muted-foreground bg-muted/20 p-4 rounded-lg border">
        <p className="font-semibold mb-1">🔒 Ledger Immutability</p>
        <p>
          All expense changes are cryptographically chained. Each entry contains a hash of the previous entry,
          making tampering detectable. The audit trail is append-only and cannot be modified or deleted.
        </p>
      </div>
    </div>
  );
}

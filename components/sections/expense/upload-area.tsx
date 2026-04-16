'use client';

import { useState } from 'react';
import { Card }     from '@/components/ui/card';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { toast }    from 'sonner';
import { type ExtractedData } from './scan-receipt';
import { autoCategorizeName } from '@/lib/expense-engine/auto-categorize';

import { useSmartSpend } from '@/context/smartspend-context';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  amount:      number;
  date:        string;
  description: string;
  category:    string;   // editable — pre-filled by auto-categorizer
  confidence:  'high' | 'medium' | 'low';
  needsReview: boolean;
}

interface UploadAreaProps {
  onDataExtracted?:    (data: ExtractedData) => void;
  onBatchConfirm?:     (transactions: ParsedTransaction[]) => void;
}

const ALLOWED_TYPES = ['application/pdf', 'text/csv'];
const ALLOWED_EXTS  = ['.pdf', '.csv'];

// ─── Component ────────────────────────────────────────────────────────────────

export function UploadArea({ onDataExtracted, onBatchConfirm }: UploadAreaProps) {
  const { isOnline } = useSmartSpend();
  const [isDragging,    setIsDragging]    = useState(false);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; status: 'processing' | 'done' | 'error' }[]>([]);

  // Multi-transaction review state
  const [transactions,  setTransactions]  = useState<ParsedTransaction[]>([]);
  const [isSaving,      setIsSaving]      = useState(false);

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
  };

  const processFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
        toast.error(`Unsupported file: ${file.name}. Please upload a PDF or CSV.`);
        continue;
      }
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    setIsProcessing(true);
    setTransactions([]);
    setUploadedFiles(prev => [...prev, { name: file.name, status: 'processing' }]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res  = await fetch('/api/expenses/upload', { method: 'POST', body: formData });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error || 'Parsing failed');

      setUploadedFiles(prev =>
        prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f)
      );

      const { transactions: txns, extracted, amountWarning } = json.data ?? {};

      // ── Multi-transaction CSV/PDF path ──────────────────────────────────
      if (txns && txns.length > 0) {
        let anyDateAdjusted = false;
        const enriched: ParsedTransaction[] = txns.map((t: any) => {
          if (t.dateAdjusted) anyDateAdjusted = true;
          return {
            amount:      t.amount,
            date:        t.date,
            description: t.description,
            category:    autoCategorizeName(t.description)?.categoryName ?? 'Other',
            confidence:  (t.confidence as 'high' | 'medium' | 'low') ?? 'low',
            needsReview: t.needsReview ?? t.confidence === 'low',
          };
        });

        if (anyDateAdjusted) {
          toast.info('Date adjusted to today');
        }

        // Surface any backend warning (e.g. positional mode used)
        const backendWarning = json.data?.warning;
        if (backendWarning) toast.warning(backendWarning);

        setTransactions(enriched);
        const reviewCount = enriched.filter(t => t.needsReview).length;
        if (reviewCount > 0) {
          toast.info(`${enriched.length} transactions found — ${reviewCount} need review (highlighted in yellow).`);
        } else {
          toast.success(`Found ${enriched.length} transaction${enriched.length > 1 ? 's' : ''}. Review and confirm below.`);
        }
        return;
      }


      // ── Single-transaction path (PDF / image fallback) ──────────────────
      if (!extracted) throw new Error('No data found in this file.');

      if (amountWarning) {
        toast.warning(amountWarning);
      } else {
        toast.success('Statement processed. Check the pre-filled form.');
      }
      onDataExtracted?.({
        amount:   extracted.amount   ?? null,
        date:     extracted.date     ?? null,
        merchant: extracted.merchant || extracted.description || null,
        category: null,
      });

    } catch (err: any) {
      setUploadedFiles(prev =>
        prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
      );
      toast.error(err.message || 'Processing error');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Batch confirm ─────────────────────────────────────────────────────────
  const handleBatchConfirm = async () => {
    if (!onBatchConfirm) return;
    setIsSaving(true);
    try {
      await onBatchConfirm(transactions);
      setTransactions([]);
    } finally {
      setIsSaving(false);
    }
  };

  const updateTransaction = (idx: number, field: keyof ParsedTransaction, value: string | number) => {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const removeTransaction = (idx: number) => {
    setTransactions(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Card className="p-8">
      <h2 className="text-2xl font-bold text-foreground mb-6">Bulk Upload / Bank Statement</h2>

      {/* Drop zone */}
      <div
        onDragEnter={!isOnline ? undefined : handleDragEnter}
        onDragLeave={!isOnline ? undefined : handleDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={!isOnline ? undefined : handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
          isDragging ? 'border-primary bg-primary/10 scale-[0.99]' : 'border-border'
        } ${!isOnline ? 'bg-muted/30 border-muted-foreground/20' : 'hover:border-primary/50'} ${
          isProcessing ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <input
          type="file" id="file-upload" multiple accept=".pdf,.csv"
          onChange={handleFileInput} disabled={isProcessing || !isOnline} className="hidden"
        />
        {!isOnline ? (
          <div className="py-2">
            <div className="text-6xl mb-6 opacity-30 grayscale">📡</div>
            <h3 className="text-xl font-bold text-muted-foreground mb-2">Offline</h3>
            <p className="text-sm text-balance text-muted-foreground max-w-xs mx-auto">
              Bank statement upload requires an internet connection. Please reconnect to use this feature.
            </p>
          </div>
        ) : (
          <>
            <div className="text-6xl mb-6">📄</div>
            <h3 className="text-xl font-bold text-foreground mb-2">Upload Bank Statement</h3>
            <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
              PDF or CSV. Transactions are extracted and auto-categorized instantly.
            </p>
            <label htmlFor="file-upload" className="inline-block">
              <div className={`bg-primary text-primary-foreground px-8 py-3 rounded-lg font-bold shadow-md transition-all ${isProcessing ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-lg active:scale-95'}`}>
                {isProcessing ? 'Extracting…' : 'Select File'}
              </div>
            </label>
          </>
        )}
      </div>

      {/* File status */}
      {uploadedFiles.length > 0 && (
        <div className="mt-6 space-y-2">
          {uploadedFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
              <span className="text-sm font-medium flex items-center gap-2">
                <span className="opacity-70">📎</span> {f.name}
              </span>
              <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${
                f.status === 'done'  ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
                f.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                'bg-accent text-accent-foreground animate-pulse'
              }`}>{f.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Multi-transaction review table ─────────────────────────────────── */}
      {transactions.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-foreground">
              Review Transactions <span className="text-muted-foreground font-normal text-sm">({transactions.length} found)</span>
            </h3>
            <p className="text-xs text-muted-foreground">Edit any field before confirming</p>
          </div>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {transactions.map((tx, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-[1fr_1fr_1fr_auto] gap-3 p-4 rounded-xl border items-center transition-colors ${
                  tx.needsReview
                    ? 'bg-amber-500/5 border-amber-400/40'
                    : 'bg-muted/20 border-border/40'
                }`}
              >
                {/* Amount */}
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1.5">
                    Amount
                    <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                      tx.confidence === 'high'   ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                      tx.confidence === 'medium' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                      'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}>
                      {tx.confidence}
                    </span>
                  </p>
                  <Input
                    type="number" step="0.01" min="0.01"
                    value={tx.amount}
                    onChange={e => updateTransaction(idx, 'amount', parseFloat(e.target.value) || 0)}
                    className="h-9 text-sm font-semibold"
                  />
                </div>
                {/* Date — read-only, locked to today */}
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Date</p>
                  <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground cursor-not-allowed gap-2">
                    <span>{tx.date}</span>
                    <span className="text-[8px] font-bold uppercase tracking-wide text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded ml-auto">Today</span>
                  </div>
                </div>
                {/* Description */}
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Description</p>
                  <Input
                    value={tx.description}
                    onChange={e => updateTransaction(idx, 'description', e.target.value)}
                    className="h-9 text-sm"
                    placeholder="Merchant / note"
                  />
                </div>
                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeTransaction(idx)}
                  className="text-muted-foreground hover:text-red-500 transition-colors mt-5 text-lg"
                  title="Remove"
                >✕</button>

                {/* Category — full width row below */}
                <div className="col-span-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
                    Category <span className="text-primary/60 normal-case font-normal">(auto-detected — edit freely)</span>
                  </p>
                  <Input
                    value={tx.category}
                    onChange={e => updateTransaction(idx, 'category', e.target.value)}
                    className="h-9 text-sm border-primary/30 bg-primary/5"
                    placeholder="Category name"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4 mt-6">
            <Button
              onClick={handleBatchConfirm}
              disabled={isSaving || transactions.length === 0}
              className="flex-1 h-12 font-bold shadow-lg shadow-primary/20"
            >
              {isSaving ? `Saving ${transactions.length} transactions…` : `Confirm & Save ${transactions.length} Transactions`}
            </Button>
            <Button
              variant="outline"
              onClick={() => setTransactions([])}
              disabled={isSaving}
              className="h-12 px-6"
            >
              Discard
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

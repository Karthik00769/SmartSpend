'use client';

import { useState, useMemo } from 'react';
import { toast }             from 'sonner';
import { ManualEntryForm }   from '@/components/sections/expense/manual-entry-form';
import { UploadArea, type ParsedTransaction } from '@/components/sections/expense/upload-area';
import { ScanReceiptArea, type ExtractedData } from '@/components/sections/expense/scan-receipt';
import { useSmartSpend }     from '@/context/smartspend-context';

type Method = 'manual' | 'scan' | 'bank';

const METHODS: { key: Method; label: string; icon: string; desc: string }[] = [
  { key: 'manual', label: 'Manual Entry', icon: '✏️', desc: 'Type in expense details' },
  { key: 'scan',   label: 'Scan Receipt', icon: '📸', desc: 'Upload or capture a receipt' },
  { key: 'bank',   label: 'Bank Upload',  icon: '🏦', desc: 'Import from CSV or PDF' },
];

export default function AddExpensePage() {
  const { addExpense } = useSmartSpend();

  const [prefill,      setPrefill]      = useState<ExtractedData | null>(null);
  const [previewSrc,   setPreviewSrc]   = useState<'scan' | 'bank' | null>(null);
  const [activeMethod, setActiveMethod] = useState<Method>('manual');

  const handleDataExtracted = (data: ExtractedData, source: 'scan' | 'bank') => {
    setPrefill(data);
    setPreviewSrc(source);
    if (window.innerWidth < 768) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearPrefill = () => { setPrefill(null); setPreviewSrc(null); };

  const initialData = useMemo(() => {
    if (!prefill) return null;
    return {
      amount:       prefill.amount   ?? undefined,
      date:         prefill.date     ?? new Date().toISOString().slice(0, 10),
      description:  prefill.merchant ?? '',
      categoryName: prefill.category ?? undefined,
    };
  }, [prefill]);

  const handleBatchConfirm = async (transactions: ParsedTransaction[]) => {
    let saved = 0, failed = 0;
    const impacts: { category: string; percent: number }[] = [];

    for (const tx of transactions) {
      const result = await addExpense({
        amount: tx.amount, date: tx.date, description: tx.description,
        categoryName: tx.category || undefined, source: 'bank_import',
      });
      if (result) {
        saved++;
        if (result.budgetImpact) {
          impacts.push({ category: result.categorization.categoryName, percent: result.budgetImpact.percent });
        }
      } else {
        failed++;
      }
    }

    if (saved > 0) {
      toast.success(`${saved} transaction${saved > 1 ? 's' : ''} saved.`);
      
      // Show summary of budget impacts
      const overBudget = impacts.filter(i => i.percent > 100);
      if (overBudget.length > 0) {
        toast.warning(`Budget Alert: ${overBudget.length} category(s) now over budget!`, {
          description: overBudget.map(i => `${i.category} (${Math.round(i.percent)}%)`).join(', '),
          duration: 8000,
        });
      }
    }
    if (failed > 0) toast.error(`${failed} failed to save.`);
  };

  const formSource = previewSrc === 'scan' ? 'ocr' : previewSrc === 'bank' ? 'bank' : 'manual';

  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-foreground mb-0.5">Add Expense</h1>
        <p className="text-sm text-muted-foreground">Record spending via manual entry, receipt scan, or bank upload.</p>
      </div>

      {/* ── DESKTOP: left method rail + right expanded panel ── */}
      <div className="hidden md:flex gap-5 items-start">

        {/* Left: vertical method selector */}
        <div className="w-44 shrink-0 flex flex-col gap-2">
          {METHODS.map(m => (
            <button
              key={m.key}
              onClick={() => { setActiveMethod(m.key); clearPrefill(); }}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all w-full ${
                activeMethod === m.key
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40'
              }`}
            >
              <span className="text-lg shrink-0">{m.icon}</span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold leading-tight ${activeMethod === m.key ? 'text-primary' : 'text-foreground'}`}>
                  {m.label}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Right: expanded panel fills remaining space */}
        <div className="flex-1 min-w-0">
          {/* Pre-fill banner */}
          {prefill && previewSrc && (
            <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-3">
              <span className="text-lg shrink-0">{previewSrc === 'scan' ? '📸' : '📄'}</span>
              <p className="text-sm text-primary flex-1">Data extracted — review and save below.</p>
              <button onClick={clearPrefill} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded">✕</button>
            </div>
          )}

          {activeMethod === 'manual' && (
            <ManualEntryForm initialData={initialData} source={formSource} onSuccess={clearPrefill} />
          )}
          {activeMethod === 'scan' && (
            prefill && previewSrc === 'scan'
              ? <ManualEntryForm initialData={initialData} source="ocr" onSuccess={clearPrefill} />
              : <ScanReceiptArea onDataExtracted={(data) => handleDataExtracted(data, 'scan')} />
          )}
          {activeMethod === 'bank' && (
            prefill && previewSrc === 'bank'
              ? <ManualEntryForm initialData={initialData} source="bank" onSuccess={clearPrefill} />
              : <UploadArea
                  onDataExtracted={(data) => handleDataExtracted(data, 'bank')}
                  onBatchConfirm={handleBatchConfirm}
                />
          )}
        </div>
      </div>

      {/* ── MOBILE: stacked layout (unchanged) ── */}
      <div className="md:hidden flex flex-col gap-5 pb-10">
        {prefill && previewSrc && (
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3">
            <span className="text-xl shrink-0">{previewSrc === 'scan' ? '📸' : '📄'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary">Data extracted</p>
              <p className="text-xs text-muted-foreground">Review and save below.</p>
            </div>
            <button onClick={clearPrefill} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">✕</button>
          </div>
        )}

        <ManualEntryForm initialData={initialData} source={formSource} onSuccess={clearPrefill} />

        <div className="border-t border-border" />

        <ScanReceiptArea onDataExtracted={(data) => handleDataExtracted(data, 'scan')} />
        <UploadArea
          onDataExtracted={(data) => handleDataExtracted(data, 'bank')}
          onBatchConfirm={handleBatchConfirm}
        />

        <div className="bg-muted/40 px-4 py-3 rounded-lg border border-border/60 text-center">
          <p className="text-xs text-muted-foreground">
            💡 Select <strong>Auto Detect</strong> in the category field for smart suggestions.
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import { useForm }            from 'react-hook-form';
import { zodResolver }        from '@hookform/resolvers/zod';
import { Button }             from '@/components/ui/button';
import { Input }              from '@/components/ui/input';
import { Card }               from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useSmartSpend }  from '@/context/smartspend-context';
import { apiGet }         from '@/lib/api-client';
import { expenseSchema, type ExpenseFormValues } from '@/lib/validation/schemas';
import { autoCategorizeName } from '@/lib/expense-engine/auto-categorize';
import { useTimezone }    from '@/hooks/use-timezone';
import { toast }          from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id:       number;
  label:    string;
  icon:     string;
  color:    string;
  isSystem: boolean;
}

export interface ManualEntryFormProps {
  onSuccess?:   () => void;
  /** Pre-filled values from OCR / bank upload */
  initialData?: (Partial<ExpenseFormValues> & { categoryName?: string | null }) | null;
  /** Label shown in the card header — 'manual' | 'ocr' | 'bank' */
  source?:      'manual' | 'ocr' | 'bank';
}

const AUTO_DETECT_VALUE = '__auto__';

// ─── Component ────────────────────────────────────────────────────────────────

export function ManualEntryForm({ onSuccess, initialData, source = 'manual' }: ManualEntryFormProps) {
  const { addExpense, submitting, submitError } = useSmartSpend();
  const { today } = useTimezone();

  const [categories,   setCategories]   = useState<Category[]>([]);
  const [autoTagMsg,   setAutoTagMsg]   = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  // Tracks the original OCR-prefilled merchant so we can detect user corrections
  const ocrMerchantRef = useRef<string>('');


  // ── Auto Detect state ──────────────────────────────────────────────────────
  // When user picks "Auto Detect" from dropdown, we show a text input instead.
  // The text input is pre-populated by the categorizer but fully editable.
  const [useAutoDetect,    setUseAutoDetect]    = useState(false);
  const [categoryText,     setCategoryText]     = useState('');   // editable text
  const [autoDetectHint,   setAutoDetectHint]   = useState<string | null>(null); // "Matched: Food & Dining"
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount:       undefined,
      categoryId:   undefined,
      categoryName: undefined,
      description:  '',
      date:         today(),
    },
  });

  // ── Force text-input mode for non-manual sources ───────────────────────────
  // When source is ocr or bank, always start in auto-detect (text input) mode.
  useEffect(() => {
    if (source === 'ocr' || source === 'bank') {
      setUseAutoDetect(true);
    }
  }, [source]);

  // ── Fetch categories ────────────────────────────────────────────────────────
  useEffect(() => {
    apiGet<{ categories: Category[] }>('/api/categories')
      .then(d => setCategories(d.categories ?? []))
      .catch(console.error);
  }, []);

  // ── Sync initialData ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialData) { setIsAutoFilled(false); return; }

    const { categoryName, ...rest } = initialData;
    setIsAutoFilled(true);

    // OCR and bank sources always use text input — never force a dropdown selection.
    // Manual source tries to map to a known category ID first.
    const forceTextInput = source === 'ocr' || source === 'bank';

    let mappedCategoryId: number | undefined = undefined;

    if (!forceTextInput && categoryName && categories.length > 0) {
      const found = categories.find(c =>
        c.label.toLowerCase().includes(categoryName.toLowerCase()) ||
        categoryName.toLowerCase().includes(c.label.toLowerCase())
      );
      if (found) mappedCategoryId = found.id;
    }

    form.reset({
      ...form.getValues(),
      ...rest,
      categoryId:   mappedCategoryId,
      categoryName: mappedCategoryId ? undefined : (categoryName ?? undefined),
    });

    // Always use text input for OCR/bank, or when no category was matched
    if (forceTextInput || (!mappedCategoryId && categoryName)) {
      setUseAutoDetect(true);
      const text = categoryName ?? '';
      setCategoryText(text);
      form.setValue('categoryName', text);
      setAutoDetectHint(text);
    }
    // Remember original OCR merchant for correction tracking
    if (source === 'ocr' && initialData?.description) {
      ocrMerchantRef.current = String(initialData.description);
    }
  }, [initialData, categories, source]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Auto-categorize on description change (debounced, only in auto mode) ───
  const runAutoDetect = useCallback((description: string, currentText: string) => {
    if (!description.trim()) return;
    const result = autoCategorizeName(description);
    if (!result) return;
    // Only suggest if user hasn't typed their own value yet
    if (!currentText.trim() || currentText === autoDetectHint) {
      setCategoryText(result.categoryName);
      form.setValue('categoryName', result.categoryName);
      setAutoDetectHint(result.categoryName);
    }
  }, [autoDetectHint, form]);

  const handleDescriptionChange = useCallback((description: string) => {
    if (!useAutoDetect) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runAutoDetect(description, categoryText);
    }, 400);
  }, [useAutoDetect, categoryText, runAutoDetect]);

  // ── Handle dropdown selection ───────────────────────────────────────────────
  const handleCategorySelect = (value: string) => {
    if (value === AUTO_DETECT_VALUE) {
      setUseAutoDetect(true);
      form.setValue('categoryId', undefined);
      // Immediately run auto-detect on current description
      const desc = form.getValues('description') ?? '';
      const result = autoCategorizeName(desc);
      const suggested = result?.categoryName ?? '';
      setCategoryText(suggested);
      setAutoDetectHint(suggested);
      form.setValue('categoryName', suggested);
    } else {
      setUseAutoDetect(false);
      setCategoryText('');
      setAutoDetectHint(null);
      form.setValue('categoryId', Number(value));
      form.setValue('categoryName', undefined);
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const onSubmit = async (values: ExpenseFormValues) => {
    setAutoTagMsg(null);
    setSuccess(false);

    const payload: Parameters<typeof addExpense>[0] = {
      amount:      values.amount,
      date:        values.date,
      description: values.description ?? '',
      categoryId:  useAutoDetect ? undefined : (values.categoryId ? Number(values.categoryId) : undefined),
      categoryName: useAutoDetect ? categoryText.trim() || undefined : undefined,
      source:      source === 'ocr' ? 'receipt_scan' : source === 'bank' ? 'bank_import' : 'manual',
    };

    const result = await addExpense(payload);

    if (result) {
      // ── Learning: if OCR source AND user changed the merchant, store correction ──
      if (source === 'ocr' && ocrMerchantRef.current) {
        const finalDesc   = values.description?.trim() ?? '';
        const origMerchant = ocrMerchantRef.current.trim();
        const correctedAmount = values.amount ?? 0;
        if (origMerchant) {
          fetch('/api/expenses/correct-ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ocrMerchant:       origMerchant,
              correctedMerchant: finalDesc || origMerchant,
              correctedAmount:   finalDesc !== origMerchant ? correctedAmount : 0,
            }),
          }).catch(() => { });
        }
        ocrMerchantRef.current = '';
      }

      if (result.autoCategized) {
        setAutoTagMsg(`Auto-categorized as "${result.categorization.categoryName}"`);
      }

      // ── Offline sentinel — expense was queued, not yet sent to server ────────
      if ('_offline' in result && result._offline) {
        toast.info(result.message, {
          description: 'Will sync automatically when you reconnect.',
          duration: 6000,
        });
      } else {
        // ── Online feedback ────────────────────────────────────────────────────
        if (result.dateAdjusted) {
          toast.info('Date adjusted to today', { duration: 4000 });
        }

        const dateObj = new Date(values.date + 'T00:00:00Z');
        const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        
        let successMsg = `Expense added for ${formattedDate}`;
        const descriptions: string[] = [];

        if (result.budgetStatus) {
          descriptions.push(`You used ${Math.round(result.budgetStatus.usedPercent)}% of your ${result.categorization.categoryName} budget`);
        }

        if (result.goalStatus) {
          descriptions.push(`Goal progress updated: ${Math.round(result.goalStatus.progress)}%`);
        }

        toast.success(successMsg, {
          description: descriptions.length > 0 ? descriptions.join(' • ') : undefined,
          duration: 6000,
        });
      }

      setSuccess(true);
      setIsAutoFilled(false);
      setUseAutoDetect(false);
      setCategoryText('');
      setAutoDetectHint(null);
      form.reset({
        amount: undefined, categoryId: undefined, categoryName: undefined,
        description: '', date: today(),
      });
      onSuccess?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => { setSuccess(false); setAutoTagMsg(null); }, 5000);
    } else {
      // result is false, hook updated submitError
      // Use a timeout or watch to handle the state change, or just check the hook value if it updates immediately
      // Actually, toast.error is best here if we can get the message.
    }
  };

  // ── Error feedback effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (submitError) {
      toast.error(submitError, { id: 'submit-error' });
    }
  }, [submitError]);

  const sourceLabel = source === 'ocr' ? 'Receipt Scan' : source === 'bank' ? 'Bank Upload' : 'Manual Entry';

  return (
    <Card className={`p-5 border transition-all duration-200 ${isAutoFilled ? 'border-primary/30 bg-primary/[0.02]' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {source === 'manual' ? 'Add Expense' : `Review — ${sourceLabel}`}
          </h2>
          {isAutoFilled && (
            <p className="text-xs text-primary mt-0.5">
              Pre-filled from {sourceLabel} — verify before saving.
            </p>
          )}
        </div>
        {isAutoFilled && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 bg-primary/10 text-primary rounded-md">
            {source === 'ocr' ? '📸 OCR' : source === 'bank' ? '📄 Bank' : '✏️ Manual'}
          </span>
        )}
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Expense saved</p>
              {autoTagMsg && <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">{autoTagMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {submitError && !success && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">⚠️ {submitError}</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number" step="0.01" min="0.01" placeholder="0.00"
                      className="h-10 font-semibold"
                      {...field}
                      onChange={e => field.onChange(e.target.value ? Number(e.target.value) : '')}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category — dropdown + optional auto-detect text input */}
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground">Category</FormLabel>

              <Select
                onValueChange={handleCategorySelect}
                value={useAutoDetect ? AUTO_DETECT_VALUE : (form.watch('categoryId') ? String(form.watch('categoryId')) : '')}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select or Auto Detect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_DETECT_VALUE}>
                    <span className="mr-2">🤖</span>
                    <span className="font-medium text-primary">Auto Detect</span>
                  </SelectItem>
                  <div className="my-1 border-t border-border/50" />
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      <span className="mr-2">{cat.icon}</span>
                      <span>{cat.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {useAutoDetect && (
                <div className="mt-1.5 space-y-1">
                  <Input
                    placeholder="Category name (editable)"
                    className="h-10 border-primary/40 bg-primary/5"
                    value={categoryText}
                    onChange={e => {
                      setCategoryText(e.target.value);
                      form.setValue('categoryName', e.target.value);
                    }}
                  />
                  {autoDetectHint && categoryText === autoDetectHint && (
                    <p className="text-xs text-muted-foreground">✨ Suggested — edit freely</p>
                  )}
                  {!categoryText.trim() && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Type a category or fill in the description to auto-suggest
                    </p>
                  )}
                </div>
              )}

              {!useAutoDetect && form.formState.errors.categoryId && (
                <p className="text-xs font-medium text-destructive mt-1">
                  {form.formState.errors.categoryId.message}
                </p>
              )}
            </FormItem>

            {/* Date — editable, bounded by today */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      className="h-10 text-foreground"
                      max={today()}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    📅 Record past or current expenses.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">Description / Merchant</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Where did you spend this?"
                      className="h-10"
                      {...field}
                      onChange={e => {
                        field.onChange(e);
                        handleDescriptionChange(e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              className="flex-1 h-10 font-semibold"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Add Expense'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 px-5"
              onClick={() => {
                form.reset({
                  amount: undefined, categoryId: undefined, categoryName: undefined,
                  description: '', date: today(),
                });
                setUseAutoDetect(false);
                setCategoryText('');
                setAutoDetectHint(null);
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}

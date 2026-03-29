'use client';

import { useState, useEffect } from 'react';
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
import { useSmartSpend }       from '@/context/smartspend-context';
import { apiGet }               from '@/lib/api-client';
import { expenseSchema, type ExpenseFormValues } from '@/lib/validation/schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id:       number;
  label:    string;
  icon:     string;
  color:    string;
  isSystem: boolean;
}

interface ManualEntryFormProps {
  onSuccess?: () => void;
  initialData?: Partial<ExpenseFormValues> | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ManualEntryForm({ onSuccess, initialData }: ManualEntryFormProps) {
  const { addExpense, submitting, submitError } = useSmartSpend();

  const [categories, setCategories] = useState<Category[]>([]);
  const [autoTagMsg, setAutoTagMsg] = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);

  // 1. Setup Form with Zod resolver
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount:      undefined,
      categoryId:  undefined,
      description: '',
      date:        new Date().toISOString().split('T')[0],
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        ...form.getValues(),
        ...initialData,
      });
    }
  }, [initialData, form]);

  // ── Fetch categories ────────────────────────────────────────────────────────
  useEffect(() => {
    apiGet<{ categories: Category[] }>('/api/categories')
      .then(d => setCategories(d.categories ?? []))
      .catch(console.error);
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const onSubmit = async (values: ExpenseFormValues) => {
    setAutoTagMsg(null);
    setSuccess(false);

    const result = await addExpense({
      amount:      values.amount,
      date:        values.date,
      description: values.description ?? '',
      categoryId:  values.categoryId ? Number(values.categoryId) : undefined,
    });

    if (result) {
      if (result.autoCategized) {
        setAutoTagMsg(
          `Auto-categorized as "${result.categorization.categoryName}" (${result.categorization.confidence} match${
            result.categorization.matchedOn ? ` on "${result.categorization.matchedOn}"` : ''
          })`,
        );
      }
      setSuccess(true);
      form.reset({
        amount:      undefined,
        categoryId:  undefined,
        description: '',
        date:        new Date().toISOString().split('T')[0],
      });
      onSuccess?.();
      setTimeout(() => { setSuccess(false); setAutoTagMsg(null); }, 5000);
    }
  };

  return (
    <Card className="p-6 mb-8">
      <h2 className="text-2xl font-bold text-foreground mb-6">Add Expense</h2>

      {/* Success banner */}
      {success && (
        <div className="mb-4 p-4 bg-green-100 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-400 font-medium">
            ✓ Expense saved to database!
          </p>
          {autoTagMsg && (
            <p className="text-sm text-green-700 dark:text-green-500 mt-1 flex items-center gap-2">
              <span>🤖</span> {autoTagMsg}
            </p>
          )}
        </div>
      )}

      {/* API error banner */}
      {submitError && !success && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-400 font-medium">⚠️ {submitError}</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number" step="0.01" min="0.01" placeholder="0.00"
                      {...field}
                      onChange={e => field.onChange(e.target.value ? Number(e.target.value) : '')}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category (optional) */}
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Category{' '}
                    <span className="text-xs text-muted-foreground font-normal">
                      (leave blank for auto-detect)
                    </span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ? String(field.value) : ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Auto-detect from description" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          <span className="mr-2">{cat.icon}</span>{cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Netflix subscription, Uber to office…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex gap-4">
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? 'Saving…' : 'Add Expense'}
            </Button>
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              Clear
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}


'use client';

import { useState } from 'react';
import { useForm }  from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Card }     from '@/components/ui/card';
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
import { useSmartSpend } from '@/context/smartspend-context';
import { budgetSchema, type BudgetFormValues } from '@/lib/validation/schemas';

// System categories (mirrors DB schema categories 1-8)
const SYSTEM_CATEGORIES = [
  { id: 1, name: 'Food & Dining',    icon: '🍔' },
  { id: 2, name: 'Transportation',   icon: '🚗' },
  { id: 3, name: 'Utilities',        icon: '💡' },
  { id: 4, name: 'Entertainment',    icon: '🎬' },
  { id: 5, name: 'Shopping',         icon: '🛍️' },
  { id: 6, name: 'Healthcare',       icon: '🏥' },
  { id: 7, name: 'Education',        icon: '📚' },
  { id: 8, name: 'Subscriptions',    icon: '📱' },
];

export function BudgetForm() {
  const { upsertBudget, budgetSubmitting, budgetSubmitError, budget } = useSmartSpend();
  const [success, setSuccess] = useState(false);

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId:  undefined,
      limitAmount: undefined,
    },
  });

  const onSubmit = async (values: BudgetFormValues) => {
    const ok = await upsertBudget({
      categoryId:  values.categoryId,
      category:    SYSTEM_CATEGORIES.find(c => c.id === values.categoryId)?.name ?? 'Other',
      amount:      values.limitAmount,
    });

    if (ok) {
      setSuccess(true);
      form.reset({ categoryId: undefined, limitAmount: undefined });
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  // Pre-fill the limit when a category is chosen
  const handleCategoryChange = (catId: string) => {
    const catNum = Number(catId);
    form.setValue('categoryId', catNum);
    
    const existing = budget?.categories.find(c => c.categoryId === catNum);
    if (existing) {
      form.setValue('limitAmount', existing.allocated);
    } else {
      form.setValue('limitAmount', undefined as any); // clear if not found
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-foreground mb-6">Set Category Budget</h2>

      {success && (
        <div className="mb-6 p-4 bg-green-100 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-400">✓ Budget saved successfully!</p>
        </div>
      )}

      {budgetSubmitError && !success && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-400">⚠️ {budgetSubmitError}</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Category picker */}
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  onValueChange={handleCategoryChange}
                  value={field.value ? String(field.value) : ''}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a category…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SYSTEM_CATEGORIES.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="mr-2">{c.icon}</span>{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Monthly limit */}
          <FormField
            control={form.control}
            name="limitAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="limit-amount">Monthly Limit ($)</FormLabel>
                <FormControl>
                  <Input
                    id="limit-amount"
                    type="number"
                    step="10"
                    min="10"
                    placeholder="300"
                    {...field}
                    onChange={e => field.onChange(e.target.value ? Number(e.target.value) : '')}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={budgetSubmitting}
          >
            {budgetSubmitting ? 'Saving…' : 'Save Budget Limit'}
          </Button>
        </form>
      </Form>

      {/* Live category spend list */}
      {budget && budget.categories.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="font-semibold text-foreground mb-4">Current Limits</h3>
          <div className="space-y-2">
            {budget.categories.map(cat => {
              const meta = SYSTEM_CATEGORIES.find(c => c.id === cat.categoryId);
              return (
                <div
                  key={cat.categoryId}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="text-sm text-foreground flex items-center gap-2">
                    {meta?.icon ?? '📌'} {cat.category}
                  </span>

                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground">
                      ${cat.spent.toFixed(0)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {' '}/ ${cat.allocated.toFixed(0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}


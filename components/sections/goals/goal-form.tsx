'use client';

import { useState, useEffect } from 'react';
import { useForm }       from 'react-hook-form';
import { zodResolver }   from '@hookform/resolvers/zod';
import { Button }        from '@/components/ui/button';
import { Input }         from '@/components/ui/input';
import { Card }          from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { useSmartSpend } from '@/context/smartspend-context';
import { apiGet }        from '@/lib/api-client';
import { goalSchema, type GoalFormValues } from '@/lib/validation/schemas';
import { GOAL_TEMPLATES } from '@/lib/constants';
import { getCurrencySymbol } from '@/lib/currency';
import { useCurrency }   from '@/hooks/use-currency';

export function GoalForm() {
  const { createGoal, goalSubmitting, goalSubmitError } = useSmartSpend();
  const { currency, fmt } = useCurrency();
  const symbol = getCurrencySymbol(currency);

  const [success,    setSuccess]    = useState(false);
  const [goalStatus, setGoalStatus] = useState<{ longTermUnlocked: boolean; monthsOfData: number } | null>(null);

  useEffect(() => {
    apiGet<{ longTermUnlocked: boolean; monthsOfData: number }>('/api/goals/status')
      .then(data => setGoalStatus(data))
      .catch(console.error);
  }, []);

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema),
    mode: 'onBlur',
    defaultValues: {
      title:        '',
      description:  '',
      targetAmount: 0,
      savedAmount:  0,
      deadline:     '',
      priority:     'medium',
      goalType:     'short_term',
    },
  });

  const goalType = form.watch('goalType');

  const onSubmit = async (values: GoalFormValues) => {
    setSuccess(false);
    const result = await createGoal({
      title:        values.title,
      description:  values.description,
      targetAmount: values.targetAmount,
      deadline:     values.deadline,
      priority:     values.priority,
      goalType:     values.goalType,
    } as any);

    if (result) {
      setSuccess(true);
      form.reset({
        title: '', description: '', targetAmount: 0, savedAmount: 0,
        deadline: '', priority: 'medium', goalType: 'short_term',
      });
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleTemplateClick = (tmpl: typeof GOAL_TEMPLATES[0]) => {
    form.setValue('title',        tmpl.label);
    form.setValue('description',  `Saving for ${tmpl.label}`);
    form.setValue('targetAmount', tmpl.amount);
    form.setValue('priority',     tmpl.priority as 'low' | 'medium' | 'high');
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-foreground mb-5">Create a New Goal</h2>

      {success && (
        <div className="mb-4 p-3 bg-green-100 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-400 font-medium">✓ Goal created successfully!</p>
        </div>
      )}

      {goalSubmitError && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-400 font-medium">⚠️ {goalSubmitError}</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* Goal Category — full width */}
          <FormField
            control={form.control}
            name="goalType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Goal Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="short_term">Short-term (≤ 1 year)</SelectItem>
                    <SelectItem value="long_term" disabled={!goalStatus?.longTermUnlocked}>
                      Long-term (&gt; 1 year)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Priority — full width */}
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">🟢 Low</SelectItem>
                    <SelectItem value="medium">🟡 Medium</SelectItem>
                    <SelectItem value="high">🔴 High</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Title — full width */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Vacation Fund" className="h-10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description — full width */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="What is this goal for?" className="h-10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Target Amount — full width with currency symbol prefix */}
          <FormField
            control={form.control}
            name="targetAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Amount ({symbol})</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                      {symbol}
                    </span>
                    <Input
                      type="number" step="10" placeholder="1000"
                      className="h-10 pl-7"
                      {...field}
                      onChange={e => field.onChange(e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Target Date — full width */}
          <FormField
            control={form.control}
            name="deadline"
            render={({ field }) => {
              const minDate    = new Date().toISOString().slice(0, 10);
              const nextYear   = new Date();
              nextYear.setFullYear(nextYear.getFullYear() + 1);
              const maxShortTerm = nextYear.toISOString().slice(0, 10);
              return (
                <FormItem>
                  <FormLabel>Target Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      min={minDate}
                      max={goalType === 'short_term' ? maxShortTerm : undefined}
                      className="h-10"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    📅 Deadline must be today or a future date.
                  </p>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {!goalStatus?.longTermUnlocked && (
            <p className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded border border-border/50">
              ℹ️ Long-term planning unlocks after 2 months of tracking. Current: {goalStatus?.monthsOfData || 0} months.
            </p>
          )}

          <Button type="submit" disabled={goalSubmitting} className="w-full h-11 mt-2">
            {goalSubmitting ? 'Creating…' : 'Create Goal'}
          </Button>
        </form>
      </Form>

      {/* Quick Templates */}
      <div className="mt-6 pt-5 border-t border-border">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Quick Templates</h3>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_TEMPLATES.slice(0, 4).map(tmpl => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => handleTemplateClick(tmpl)}
              className="text-left p-2.5 rounded-lg border border-border hover:bg-muted hover:border-primary/40 transition-colors group"
            >
              <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                {tmpl.label}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {fmt(tmpl.amount)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

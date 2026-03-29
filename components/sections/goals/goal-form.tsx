'use client';

import { useState, useEffect } from 'react';
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
import { apiGet } from '@/lib/api-client';
import { goalSchema, type GoalFormValues } from '@/lib/validation/schemas';
import { GOAL_TEMPLATES } from '@/lib/constants';

export function GoalForm() {
  const { createGoal, goalSubmitting, goalSubmitError } = useSmartSpend();
  const [success, setSuccess] = useState(false);
  const [goalStatus, setGoalStatus] = useState<{ longTermUnlocked: boolean; monthsOfData: number } | null>(null);

  useEffect(() => {
    apiGet<{ longTermUnlocked: boolean; monthsOfData: number }>('/api/goals/status')
      .then(data => setGoalStatus(data))
      .catch(console.error);
  }, []);

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      title:        '',
      targetAmount: undefined,
      currentAmount: 0,
      deadline:     '',
      priority:     'medium',
    },
  });

  const onSubmit = async (values: GoalFormValues) => {
    setSuccess(false);

    const result = await createGoal({
      title:        values.title,
      targetAmount: values.targetAmount,
      deadline:     values.deadline,
      priority:     values.priority,
    });


    if (result) {
      setSuccess(true);
      form.reset({
        title:        '',
        targetAmount: undefined,
        currentAmount: 0,
        deadline:     '',
        priority:     'medium',
      });
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleTemplateClick = (tmpl: typeof GOAL_TEMPLATES[0]) => {
    form.setValue('title', tmpl.label);
    form.setValue('targetAmount', tmpl.amount);
    form.setValue('priority', tmpl.priority as 'low' | 'medium' | 'high');
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-foreground mb-6">Create a New Goal</h2>

      {success && (
        <div className="mb-6 p-4 bg-green-100 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-400">
            ✓ Goal created successfully! Tracking has started.
          </p>
        </div>
      )}

      {goalSubmitError && !success && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-400">⚠️ {goalSubmitError}</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Title */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Goal Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Emergency Fund" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Target amount */}
          <FormField
            control={form.control}
            name="targetAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Amount ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number" step="100" min="1" placeholder="5000"
                    {...field}
                    onChange={e => field.onChange(e.target.value ? Number(e.target.value) : '')}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Deadline */}
          <FormField
            control={form.control}
            name="deadline"
            render={({ field }) => {
              const maxDate = (!goalStatus?.longTermUnlocked && goalStatus != null)
                ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
                : undefined;

              return (
                <FormItem>
                  <FormLabel>Target Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      max={maxDate}
                      {...field}
                    />
                  </FormControl>
                  {!goalStatus?.longTermUnlocked && goalStatus != null && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      Long-term planning (1+ years) unlocks after 2 months of expense tracking.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {/* Priority */}
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority Level</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
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

          <Button type="submit" disabled={goalSubmitting} className="w-full">
            {goalSubmitting ? 'Creating…' : 'Create Goal'}
          </Button>
        </form>
      </Form>

      {/* Quick-fill templates */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="font-semibold text-foreground mb-4">Popular Goal Templates</h3>
        <div className="space-y-2">
          {GOAL_TEMPLATES.map(tmpl => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => handleTemplateClick(tmpl)}
              className="w-full text-left p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              <div className="font-medium text-foreground">{tmpl.label}</div>
              <div className="text-sm text-muted-foreground">${tmpl.amount.toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}


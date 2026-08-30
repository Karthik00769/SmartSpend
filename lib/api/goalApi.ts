/**
 * lib/api/goalApi.ts
 * ─────────────────────────────────────────────────────────────────────
 * All client-side API functions for the /api/goals endpoint.
 *
 * Functions:
 *   getGoals(opts?)           → GET  /api/goals
 *   createGoal(input)         → POST /api/goals
 *
 * Example:
 *   import { getGoals, createGoal } from '@/lib/api/goalApi';
 *
 *   const { goals } = await getGoals();
 *   const { goal }  = await createGoal({ title: 'Emergency Fund', targetAmount: 5000, targetDate: '2026-12-31' });
 */

import { get, post, buildQuery } from './apiClient';
import type {
  GoalDTO,
  CreateGoalInput,
  GoalLifecycleStatus,
  Priority,
} from '@/types/api';

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface GetGoalsResponse {
  goals: GoalDTO[];
  count: number;
}

export interface CreateGoalResponse {
  goal: GoalDTO;
}

// ─── Input helpers ────────────────────────────────────────────────────────────

export interface GetGoalsOptions {
  status?: GoalLifecycleStatus;
}

/** userId is auto-resolved if omitted */
export type CreateGoalPayload = Omit<CreateGoalInput, 'userId'> & {
  priority?: Priority;
};

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * getGoals
 * Fetch all goals for the current user, optionally filtered by status.
 * Includes computed fields: completionPct, daysRemaining, requiredDailySavings.
 *
 * @example
 * // All active goals (default)
 * const { goals } = await getGoals();
 * goals.forEach(g => console.log(g.title, `${g.completionPct}%`));
 *
 * // Completed goals
 * const { goals: done } = await getGoals({ status: 'completed' });
 */
export async function getGoals(
  opts: GetGoalsOptions = {},
): Promise<GetGoalsResponse> {
  const qs = buildQuery({
    status: opts.status ?? 'active',
  });
  return get<GetGoalsResponse>(`/api/goals${qs}`);
}

/**
 * createGoal
 * Create a new savings goal.
 *
 * @example
 * const { goal } = await createGoal({
 *   title:        'Emergency Fund',
 *   targetAmount: 5000,
 *   targetDate:   '2026-12-31',
 *   priority:     'high',
 *   description:  '3 months of living expenses',
 * });
 * console.log(goal.id, goal.requiredDailySavings);
 */
export async function createGoal(
  input: CreateGoalPayload,
): Promise<CreateGoalResponse> {
  return post<CreateGoalResponse>('/api/goals', {
    ...input,
  });
}

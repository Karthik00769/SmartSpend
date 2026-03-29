/**
 * hooks/use-goals.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  — list savings goals (with engine-computed probability data)
 * POST — create a new goal
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, buildQuery, ApiRequestError } from '@/lib/api-client';
import type { GoalDTO } from '@/types/api';

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface CreateGoalPayload {
  title:        string;
  targetAmount: number;
  deadline:     string;   // YYYY-MM-DD
  priority?:    'low' | 'medium' | 'high';
  icon?:        string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseGoalsOptions {
  status?:  'active' | 'completed' | 'all';
}

export interface UseGoalsReturn {
  goals:       GoalDTO[];
  loading:     boolean;
  error:       string | null;
  submitting:  boolean;
  submitError: string | null;
  createGoal:  (payload: CreateGoalPayload) => Promise<GoalDTO | null>;
  refresh:     () => void;
}

export function useGoals(opts: UseGoalsOptions = {}): UseGoalsReturn {
  const status = opts.status ?? 'active';

  const [goals,       setGoals]      = useState<GoalDTO[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState<string | null>(null);
  const [submitting,  setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tick,        setTick]       = useState(0);

  const refresh = useCallback(() => setTick(n => n + 1), []);

  // ── Fetch goals ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchGoals() {
      setLoading(true);
      setError(null);
      try {
        const qs   = buildQuery({ status });
        const data = await apiGet<{ goals: GoalDTO[] }>(`/api/goals${qs}`);
        if (!cancelled) setGoals(data.goals);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError ? err.message : 'Failed to load goals.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchGoals();
    return () => { cancelled = true; };
  }, [status, tick]);

  // ── Create goal ─────────────────────────────────────────────────────────────
  const createGoal = useCallback(
    async (payload: CreateGoalPayload): Promise<GoalDTO | null> => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await apiPost<{ goal: GoalDTO }>('/api/goals', {
          ...payload,
        });
        refresh();
        return result.goal;
      } catch (err) {
        setSubmitError(
          err instanceof ApiRequestError ? err.message : 'Failed to create goal.',
        );
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [refresh],
  );

  return { goals, loading, error, submitting, submitError, createGoal, refresh };
}

/**
 * lib/api/apiClient.ts
 * ─────────────────────────────────────────────────────────────────────
 * Base HTTP transport for the SmartSpend API layer.
 *
 * Re-exports the shared primitives from lib/api-client.ts and adds
 * one extra helper (apiDelete) plus the default userId resolver.
 *
 * All domain API files (expenseApi, budgetApi, …) import from here —
 * never directly from lib/api-client.ts.
 *
 * Usage:
 *   import { get, post, patch, ApiError } from '@/lib/api/apiClient';
 */

// ─── Re-export everything from the core transport ─────────────────────────────

export {
  apiGet    as get,
  apiPost   as post,
  apiPatch  as patch,
  buildQuery,
  ApiRequestError,
}                                   from '@/lib/api-client';

export type { ApiRequestError as ApiError } from '@/lib/api-client';

// ─── DELETE helper (not in core client yet) ───────────────────────────────────

import type { ApiError as ApiErrorType } from '@/types/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res  = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = await res.json() as { ok: boolean; data?: T } & Partial<ApiErrorType>;
  if (!json.ok) {
    const { ApiRequestError } = await import('@/lib/api-client');
    throw new ApiRequestError(
      res.status,
      (json as ApiErrorType).error ?? 'Unknown error',
      (json as ApiErrorType).details,
    );
  }
  return json.data as T;
}

export const del = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });

// ─── Default user resolution ──────────────────────────────────────────────────
// DEPRECATED: derivation of user identity is now handled serverside via session.
// Front-end should no longer pass userId in requests.

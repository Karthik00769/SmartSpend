/**
 * lib/api-client.ts
 * ─────────────────────────────────────────────────────────────────────
 * Typed fetch wrapper for all SmartSpend API endpoints.
 *
 * All responses use the { ok, data } / { ok, error } envelope.
 * This client unwraps it so callers only deal with the data type.
 *
 * Usage:
 *   const data = await apiGet<DashboardData>('/api/analytics');
 *   const exp  = await apiPost<ExpenseData>('/api/expenses', payload);
 */

import type { ApiError } from '@/types/api';

// ─── Custom error class ───────────────────────────────────────────────────────

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// ─── Core fetch util ──────────────────────────────────────────────────────────

async function apiFetch<T>(
  path:   string,
  init?:  RequestInit,
): Promise<T> {
  const isFormData = init?.body && typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(init?.headers);

  // Set default JSON Content-Type only if not FormData and not already set
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  const text = await res.text();
  let json: any = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch (err) {
      if (!res.ok) {
        throw new ApiRequestError(res.status, text || res.statusText || 'Server error');
      }
      throw new ApiRequestError(res.status, 'Unparsable response from server');
    }
  } else {
    json = {};
  }

  if (!res.ok || json.ok === false) {
    if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      console.warn('[API] 401 Unauthorized. Redirecting to login.');
      window.location.href = '/login';
    }
    const errorMsg = json.error || json.message || res.statusText || text || `Request failed with status ${res.status}`;
    throw new ApiRequestError(res.status, errorMsg, json.details);
  }

  return json.data !== undefined ? json.data : json;
}

// ─── Convenience methods ──────────────────────────────────────────────────────

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiPost = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const apiPatch = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = <T>(path: string) =>
  apiFetch<T>(path, { method: 'DELETE' });

// ─── Query string builder ─────────────────────────────────────────────────────

/** Build a query string from a params object, omitting undefined values */
export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

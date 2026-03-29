/**
 * lib/api-response.ts
 * ─────────────────────────────────────────────────────────────────────
 * Thin helpers that wrap values in the { ok, data } / { ok, error }
 * envelope and return a NextResponse — keeping route handlers DRY.
 */
import { NextResponse } from 'next/server';
import type { ApiSuccess, ApiError } from '@/types/api';

/** 200 / 201 success response */
export function ok<T>(data: T, status: 200 | 201 = 200): NextResponse<any> {
  return NextResponse.json({ ok: true, success: true, data }, { status });
}

/** 4xx / 5xx error response */
export function fail(
  message: string,
  status: number = 500,
  details?: Record<string, string[]>,
): NextResponse<any> {
  const body: any = { ok: false, success: false, error: message };
  if (details) body.details = details;
  return NextResponse.json(body, { status });
}

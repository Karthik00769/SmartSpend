/**
 * app/api/expenses/correct-ocr/route.ts
 * POST /api/expenses/correct-ocr
 *
 * Called by the frontend when a user edits an OCR-prefilled merchant or amount.
 * Stores the correction in the learning store so future OCR for the same
 * merchant is automatically corrected.
 *
 * Body: { ocrMerchant: string, correctedMerchant: string, correctedAmount?: number }
 * Response: { ok: true } | { ok: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import { saveCorrection }            from '@/lib/expense-engine/learning/correction-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { ocrMerchant, correctedMerchant, correctedAmount } = body ?? {};

    if (!ocrMerchant || typeof ocrMerchant !== 'string') {
      return NextResponse.json({ ok: false, error: 'ocrMerchant is required.' }, { status: 400 });
    }
    if (!correctedMerchant || typeof correctedMerchant !== 'string') {
      return NextResponse.json({ ok: false, error: 'correctedMerchant is required.' }, { status: 400 });
    }

    const amount = typeof correctedAmount === 'number' && correctedAmount > 0
      ? correctedAmount
      : 0;

    await saveCorrection(ocrMerchant.trim(), correctedMerchant.trim(), amount);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[CORRECT-OCR] Error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to save correction.' }, { status: 500 });
  }
}

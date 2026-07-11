/**
 * app/api/expenses/scan/route.ts
 * POST /api/expenses/scan
 *
 * Deterministic OCR scanning route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { processReceiptImage } from '@/lib/ocr';
import * as FinanceCore from '@/lib/finance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'File too large (max 10 MB).' }, { status: 413 });
    }
    const mimeType = file.type.toLowerCase();
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isImage = IMAGE_TYPES.has(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (!isImage) {
      return NextResponse.json({ ok: false, error: 'Only image files are supported.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Module 4: Deterministic OCR Pipeline
    const ocrResult = await processReceiptImage(buffer);
    
    const parsedAmount = ocrResult.parsed.amountRaw ? parseFloat(ocrResult.parsed.amountRaw.replace(/[^0-9.]/g, '')) : 0;
    const amount = isNaN(parsedAmount) ? 0 : parsedAmount;
    
    const merchant = FinanceCore.Parsing.sanitizeMerchantName(ocrResult.parsed.merchantRaw || '');
    const date = ocrResult.parsed.dateRaw || new Date().toISOString().slice(0, 10);
    const dateAdjusted = !ocrResult.parsed.dateRaw;

    const amountWarning = amount === 0 
        ? 'Could not detect a valid amount — please enter it manually.' 
        : ocrResult.needsReview ? 'Amount detected but confidence is low — verify before saving.' : null;

    return NextResponse.json({
      ok: true,
      data: {
        extracted: {
          amount,
          date,
          merchant,
          description: merchant, // default description to merchant
          dateAdjusted,
        },
        source: 'ocr',
        confidence: ocrResult.confidence,
        needsReview: ocrResult.needsReview,
        amountWarning,
        _debug: {
          ocrConfidence: Math.round(ocrResult.confidence.overall),
          textLength: ocrResult.rawText.trim().length,
          extractedDate: date,
        },
      },
    });
  } catch (err: any) {
    console.error('[SCAN] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

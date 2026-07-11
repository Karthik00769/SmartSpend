/**
 * app/api/expenses/upload/route.ts
 * POST /api/expenses/upload
 *
 * Deterministic upload route relying on lib/ocr and lib/bank.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import { processReceiptImage }       from '@/lib/ocr';
import { processBankStatement }      from '@/lib/bank';
import * as FinanceCore              from '@/lib/finance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES   = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE    = 'application/pdf';
const TEXT_TYPES  = new Set(['text/csv', 'text/plain', 'text/tab-separated-values']);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ ok: false, error: 'The file is empty.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File too large (max 10 MB).' }, { status: 413 });

    const ext      = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const mimeType = file.type.toLowerCase();
    const isImage  = IMAGE_TYPES.has(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const isPDF    = mimeType === PDF_TYPE || ext === '.pdf';
    const isText   = TEXT_TYPES.has(mimeType) || ['.csv', '.txt', '.tsv'].includes(ext);

    if (!isImage && !isPDF && !isText) {
      return NextResponse.json({ ok: false, error: 'Unsupported file type.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (isImage) {
      const ocrResult = await processReceiptImage(buffer);
      
      const parsedAmount = ocrResult.parsed.amountRaw ? parseFloat(ocrResult.parsed.amountRaw.replace(/[^0-9.]/g, '')) : 0;
      const amount = isNaN(parsedAmount) ? 0 : parsedAmount;
      const merchant = FinanceCore.Parsing.sanitizeMerchantName(ocrResult.parsed.merchantRaw || '');
      const date = ocrResult.parsed.dateRaw || new Date().toISOString().slice(0, 10);
      
      const amountWarning = amount === 0 
          ? 'Could not detect a valid amount — please enter it manually.' 
          : ocrResult.needsReview ? 'Amount detected but confidence is low — verify before saving.' : null;

      return NextResponse.json({
        ok: true,
        data: {
          extracted: {
            amount,
            date,
            dateAdjusted: !ocrResult.parsed.dateRaw,
            merchant,
            description: merchant,
          },
          source: 'ocr',
          confidence: ocrResult.confidence,
          needsReview: ocrResult.needsReview,
          amountWarning,
        },
      });
    } else {
      // Bank Document (PDF or CSV)
      const textContent = isText ? buffer.toString('utf8') : '';
      const bankResult = await processBankStatement(buffer, textContent, {
        fileType: isPDF ? 'pdf' : 'csv',
        fileName: file.name
      });
      
      return NextResponse.json({
        ok: true,
        data: {
          transactions: bankResult.metadata.transactions,
          source: 'bank',
          parseMode: isPDF ? 'pdf-lines' : 'csv',
        },
      });
    }

  } catch (err: any) {
    console.error('[UPLOAD] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected processing error occurred.' }, { status: 500 });
  }
}

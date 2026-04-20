/**
 * app/api/expenses/upload/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * POST /api/expenses/upload
 *
 * Accepts: multipart/form-data with a "file" field.
 * Supported file types:
 *   - PDF  → text extraction via pdf-parse
 *   - Images → multi-pass Tesseract OCR (via scan route logic, shared parser)
 *   - CSV / TXT → UTF-8 text extraction with dynamic column detection
 *
 * IMPORTANT: This route NEVER saves to the database.
 * All dates are forced to today (server-side).
 *
 * Amount validation: 1 ≤ amount ≤ 1,00,000. Outside this range → discarded.
 *
 * Response: { ok: true, data: { extracted | transactions, ... } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import path                          from 'node:path';
import { pathToFileURL }             from 'node:url';
import {
  parseReceiptTextWithLearning,
  cleanOCRText,
} from '@/lib/ocr/receipt-parser';
import { preprocessImageWithOpenCV } from '@/lib/ocr/opencv-preprocess';
import { parseCSV, parsePDFBankText } from '@/lib/ocr/bank-parser';


// NOTE: pdf-processor is intentionally NOT imported here at the top level.
// pdfjs-dist (used inside pdf-processor) requires browser globals (DOMMatrix etc.)
// that don't exist in Node.js at module-load time. We polyfill them here first,
// then dynamically import pdf-processor only when a PDF is actually received.
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

// ─── Browser-global polyfills for pdfjs-dist ─────────────────────────────────
if (typeof globalThis.DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    is2D = true; isIdentity = true;
    a=1;b=0;c=0;d=1;e=0;f=0;
    m11=1;m12=0;m13=0;m14=0;m21=0;m22=1;m23=0;m24=0;
    m31=0;m32=0;m33=1;m34=0;m41=0;m42=0;m43=0;m44=1;
    static fromFloat64Array() { return new (globalThis as any).DOMMatrix(); }
    static fromFloat32Array() { return new (globalThis as any).DOMMatrix(); }
    static fromMatrix()       { return new (globalThis as any).DOMMatrix(); }
    translate() { return this; } scale()    { return this; }
    rotate()    { return this; } inverse()  { return this; }
    multiply()  { return this; } flipX()    { return this; }
    flipY()     { return this; } skewX()    { return this; }
    skewY()     { return this; } transformPoint(p: any) { return p; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
    toString() { return 'matrix(1,0,0,1,0,0)'; }
  };
}
if (typeof globalThis.Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    constructor(_?: any) {}
    addPath(){} closePath(){} moveTo(){} lineTo(){}
    arc(){}     arcTo(){}    ellipse(){} rect(){}
    bezierCurveTo(){} quadraticCurveTo(){}
  };
}
if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray; width: number; height: number; colorSpace = 'srgb';
    constructor(wOrArr: number | Uint8ClampedArray, h: number, w?: number) {
      if (typeof wOrArr === 'number') {
        this.width = wOrArr; this.height = h;
        this.data  = new Uint8ClampedArray(wOrArr * h * 4);
      } else {
        this.data = wOrArr; this.width = h;
        this.height = w ?? wOrArr.length / (4 * h);
      }
    }
  };
}

// Worker path for Tesseract — built from process.cwd() so webpack cannot intercept it
const NM = path.join(process.cwd(), 'node_modules');
const TESSERACT_WORKER = path.join(NM, 'tesseract.js/src/worker-script/node/index.js');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES   = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE    = 'application/pdf';
const TEXT_TYPES  = new Set(['text/csv', 'text/plain', 'text/tab-separated-values']);

// ─── Single pass preprocessing ────────────────────────────────────────────────
// ─── Route handler ────────────────────────────────────────────────────────────

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
    if (file.size === 0) {
      return NextResponse.json({ ok: false, error: 'The file is empty.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'File too large (max 10 MB).' }, { status: 413 });
    }

    const ext      = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const mimeType = file.type.toLowerCase();
    const isImage  = IMAGE_TYPES.has(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const isPDF    = mimeType === PDF_TYPE || ext === '.pdf';
    const isText   = TEXT_TYPES.has(mimeType) || ['.csv', '.txt', '.tsv'].includes(ext);

    if (!isImage && !isPDF && !isText) {
      return NextResponse.json({ ok: false, error: 'Unsupported file type.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText  = '';
    const todayDate = new Date().toISOString().slice(0, 10);

    // ── IMAGE — OpenCV + Sharp multi-pass Tesseract OCR ──────────────────
    if (isImage) {
      try {
        const workerPath = pathToFileURL(TESSERACT_WORKER).href;
        const worker = await Tesseract.createWorker('eng', 1, { workerPath });
        await worker.setParameters({
          tessedit_pageseg_mode: '6' as any,
          preserve_interword_spaces: '1',
        });

        interface OCRCandidate { text: string; confidence: number; pass: string; }
        const candidates: OCRCandidate[] = [];

        const tryBuffer = async (buf: Buffer, pass: string) => {
          try {
            const { data: { text, confidence } } = await worker.recognize(buf);
            const cleaned = cleanOCRText(text);
            candidates.push({ text: cleaned, confidence: confidence ?? 0, pass });
          } catch (e: any) {
             console.warn(`[UPLOAD/${pass}] skip:`, e?.message);
          }
        };

        const cvVariants = await preprocessImageWithOpenCV(buffer);
        for (const v of cvVariants) {
          await tryBuffer(v.buffer, `opencv-${v.variantName}`);
        }

        const meta = await sharp(buffer).metadata();
        const width = meta.width ? Math.round(meta.width * 2) : undefined;
        const preprocessed = await sharp(buffer)
          .resize({ width })
          .grayscale()
          .threshold(150)
          .toBuffer();
        
        await tryBuffer(preprocessed, 'sharp-baseline');

        let bestScore = -1;
        let bestCandidate: OCRCandidate | null = null;

        for (const cand of candidates) {
          const lower = cand.text.toLowerCase();
          
          let keywordCount = 0;
          if (lower.includes('total')) keywordCount++;
          if (lower.includes('amount')) keywordCount++;
          if (lower.includes('paid')) keywordCount++;
          const keywordScore = Math.min(keywordCount / 2, 1) * 30;

          let currencyScore = 0;
          if (/[\$\£\€\₹]/.test(lower) || /rs\.?|inr|usd/.test(lower) || /\d+\.\d{2}/.test(lower)) {
            currencyScore = 30;
          }

          const confScore = (cand.confidence / 100) * 40;
          const totalScore = confScore + keywordScore + currencyScore;
          
          if (totalScore > bestScore) {
            bestScore = totalScore;
            bestCandidate = cand;
          }
        }

        try {
          rawText = bestCandidate ? bestCandidate.text : candidates[0]?.text ?? '';
          console.log(`[UPLOAD] Final OCR: conf=${bestCandidate?.confidence.toFixed(0)} chars=${rawText.trim().length}`);
        } finally {
          await worker.terminate();
        }
      } catch (err: any) {
        console.error('[UPLOAD/OCR] Failed:', err);
        return NextResponse.json({ ok: false, error: 'Failed to process image via OCR.' }, { status: 422 });
      }
    }


    // ── PDF — smart detection: digital vs scanned ──────────────────────────
    else if (isPDF) {
      try {
        // Dynamically import pdf-processor to prevent pdfjs-dist loading at build time.
        const { processPDF } = await import('@/lib/ocr/pdf-processor');
        const pdfResult = await processPDF(buffer);
        rawText = pdfResult.text;

        console.log(
          `[UPLOAD/PDF] isDigital=${pdfResult.isDigital}`,
          `| pages=${pdfResult.pageCount}`,
          `| pagesOCRd=${pdfResult.pagesOCRd}`,
          `| textLen=${rawText.length}`,
          pdfResult.warning ? `| warning: ${pdfResult.warning}` : '',
        );

        // If the PDF processor returned a warning (e.g. scanned PDF couldn't render)
        // surface it to the user immediately instead of silently failing
        if (pdfResult.warning && rawText.length < 5) {
          return NextResponse.json({
            ok: true,
            data: {
              extracted:     { amount: 0, date: todayDate, merchant: '', description: '' },
              source:        'bank',
              needsReview:   true,
              amountWarning: pdfResult.warning,
            },
          });
        }
      } catch (err: any) {
        console.error('[UPLOAD/PDF] Failed:', err);
        return NextResponse.json({ ok: false, error: 'Failed to process PDF document.' }, { status: 422 });
      }
    }

    // ── TEXT / CSV / TSV ───────────────────────────────────────────────────
    else if (isText) {
      rawText = buffer.toString('utf8');
    }

    // ── Guard: empty text ──────────────────────────────────────────────────
    if (!rawText || rawText.trim().length < 5) {
      if (isPDF) {
        return NextResponse.json({
          ok: true,
          data: {
            extracted:     { amount: 0, date: todayDate, merchant: '', description: '' },
            source:        'bank',
            needsReview:   true,
            amountWarning: 'This PDF has no readable text layer. Please enter details manually.',
          },
        });
      }
      return NextResponse.json({ ok: false, error: 'File appears empty or unreadable.' }, { status: 422 });
    }

    console.log('[UPLOAD] Text preview:', rawText.slice(0, 400).replace(/\n/g, ' | '));

    // ── CSV / TSV: hardened multi-transaction path ─────────────────────────
    if (isText) {
      const parseResult = parseCSV(rawText, todayDate);
      const rowCount = parseResult.totalRows;
      const validCount = parseResult.transactions.length;
      const accuracy = rowCount > 0 ? (validCount / rowCount) : 0;

      if (validCount > 0) {
        console.log(`[UPLOAD/CSV] ${validCount}/${rowCount} rows | acc=${(accuracy * 100).toFixed(0)}%`);

        if (accuracy < 0.7 && rowCount > 5) {
          return NextResponse.json({
            ok: false,
            error: 'LOW_ACCURACY',
            message: 'Unable to parse bank statement accurately. Please try a different format or clearer file.'
          }, { status: 422 });
        }

        return NextResponse.json({
          ok: true,
          data: {
            transactions: parseResult.transactions,
            source:       'bank',
            parseMode:    parseResult.parseMode,
          },
        });
      }
      console.log('[UPLOAD/CSV] Zero transactions extracted — trying single-receipt parser');
    }

    // ── PDF: try hardened bank-statement row parser, then single-receipt parse ─
    if (isPDF) {
      const parseResult = parsePDFBankText(rawText, todayDate);
      const rowCount = parseResult.totalRows;
      const validCount = parseResult.transactions.length;
      const accuracy = rowCount > 0 ? (validCount / rowCount) : 0;

      if (validCount > 1) {
        console.log(`[UPLOAD/PDF] Bank statement: ${validCount}/${rowCount} rows | acc=${(accuracy * 100).toFixed(0)}%`);

        if (accuracy < 0.7 && rowCount > 5) {
          return NextResponse.json({
            ok: false,
            error: 'LOW_ACCURACY',
            message: 'Unable to parse bank statement accurately. Please try a different format or clearer file.'
          }, { status: 422 });
        }

        return NextResponse.json({
          ok: true,
          data: {
            transactions: parseResult.transactions,
            source:       'bank',
            parseMode:    'pdf-lines',
          },
        });
      }
      console.log('[UPLOAD/PDF] Single-entry or no-structure PDF — using receipt parser');
    }

    // ── Single-transaction fallback (image receipt / single-entry PDF) ──────
    const parsed = await parseReceiptTextWithLearning(rawText);


    const amountWarning = parsed.amount === 0
      ? 'Could not detect a valid amount — please enter it manually.'
      : parsed.needsReview
      ? 'Amount detected but confidence is low — please verify before saving.'
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        extracted: {
          amount:      parsed.amount,
          date:        parsed.date,
          dateAdjusted: parsed.dateAdjusted,
          merchant:    parsed.merchant,
          description: parsed.description,
        },
        source:      isImage ? 'ocr' : 'bank',
        confidence:  parsed.confidence,
        needsReview: parsed.needsReview,
        amountWarning,
      },
    });

  } catch (err: any) {
    console.error('[UPLOAD] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected processing error occurred.' }, { status: 500 });
  }
}

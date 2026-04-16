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
import { parseCSV, parsePDFBankText } from '@/lib/ocr/bank-parser';
import { preprocessImageWithOpenCV } from '@/lib/ocr/opencv-preprocess';


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

// ─── Multi-pass image preprocessor (same as scan route) ─────────────────────

async function preprocessImage(sharp: any, buf: Buffer): Promise<{ buffer: Buffer; pass: string }> {
  const passes = [
    {
      name: 'gentle',
      fn: async () => sharp(buf).grayscale().normalize().sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 }).png({ compressionLevel: 1 }).toBuffer(),
    },
    {
      name: 'contrast-boost',
      fn: async () => sharp(buf).grayscale().normalize().linear(1.6, -(128 * 0.6)).sharpen({ sigma: 1.5 }).png({ compressionLevel: 1 }).toBuffer(),
    },
    {
      name: 'threshold',
      fn: async () => sharp(buf).grayscale().normalize().threshold(145).png({ compressionLevel: 1 }).toBuffer(),
    },
  ];

  let best: { buffer: Buffer; textLen: number; conf: number; pass: string } | null = null;
  const workerPath = pathToFileURL(TESSERACT_WORKER).href;
  const worker     = await Tesseract.createWorker('eng', 1, {
    workerPath,
  });
  await worker.setParameters({ 
    tessedit_pageseg_mode: '6' as any,
    preserve_interword_spaces: '1',
  });

  for (const p of passes) {
    try {
      const processed = await p.fn();
      const { data: { text, confidence } } = await worker.recognize(processed);
      const cleaned = cleanOCRText(text);
      const tLen = cleaned.trim().length;
      const conf = confidence ?? 0;
      console.log(`[UPLOAD/${p.name}] conf=${conf.toFixed(0)} chars=${tLen}`);

      if (!best || tLen > best.textLen * 1.15 || (conf > best.conf + 10 && tLen > 20)) {
        best = { buffer: processed, textLen: tLen, conf, pass: p.name };
      }
      if (best.conf >= 80 && best.textLen > 100) break;
    } catch (e: any) {
      console.warn(`[UPLOAD/${p.name}] skip:`, e?.message);
    }
  }

  // Get final text using best buffer
  const { data: { text: finalText } } = await worker.recognize(best!.buffer);
  await worker.terminate();
  return { buffer: best!.buffer, pass: best!.pass };
}

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

        let bestText = '';
        let bestConf = 0;

        // Helper: try a buffer, update best if better
        const tryBuf = async (buf: Buffer, label: string) => {
          try {
            const { data: { text, confidence } } = await worker.recognize(buf);
            const cleaned = cleanOCRText(text);
            const tLen = cleaned.trim().length;
            const conf = confidence ?? 0;
            console.log(`[UPLOAD/${label}] conf=${conf.toFixed(0)} chars=${tLen}`);
            if (tLen > bestText.trim().length * 1.15 || (conf > bestConf + 10 && tLen > 20)) {
              bestText = cleaned;
              bestConf = conf;
            }
          } catch (e: any) { console.warn(`[UPLOAD/${label}] skip:`, e?.message); }
        };

        // STAGE 1: OpenCV variants (adaptive threshold, aggressive boost, edge-enhanced)
        let opencvUsed = false;
        try {
          const cvVariants = await preprocessImageWithOpenCV(buffer);
          if (cvVariants.length > 0) {
            opencvUsed = true;
            for (const v of cvVariants) {
              await tryBuf(v.buffer, `opencv-${v.variantName}`);
              if (bestConf >= 85 && bestText.trim().length > 150) break;
            }
            console.log(`[UPLOAD] OpenCV: ${cvVariants.length} variants, bestConf=${bestConf.toFixed(0)}`);
          }
        } catch (e: any) {
          console.warn('[UPLOAD] OpenCV failed:', e?.message);
        }

        // STAGE 2: Classic Sharp fallback (always runs if OpenCV didn't get good result)
        if (!opencvUsed || bestConf < 80 || bestText.trim().length < 100) {
          const sharpPasses = [
            { name: 'gentle',    fn: () => sharp(buffer).grayscale().normalize().sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 }).png({ compressionLevel: 1 }).toBuffer() },
            { name: 'contrast',  fn: () => sharp(buffer).grayscale().normalize().linear(1.6, -(128 * 0.6)).sharpen({ sigma: 1.5 }).png({ compressionLevel: 1 }).toBuffer() },
            { name: 'threshold', fn: () => sharp(buffer).grayscale().normalize().threshold(145).png({ compressionLevel: 1 }).toBuffer() },
          ];
          for (const p of sharpPasses) {
            try {
              await tryBuf(await p.fn(), `sharp-${p.name}`);
              if (bestConf >= 80 && bestText.trim().length > 100) break;
            } catch (e: any) { console.warn(`[UPLOAD/sharp-${p.name}] skip:`, e?.message); }
          }
        }

        await worker.terminate();
        rawText = bestText;
        console.log(`[UPLOAD] Final OCR: conf=${bestConf.toFixed(0)} chars=${bestText.trim().length}`);
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
      if (parseResult.transactions.length > 0) {
        console.log(`[UPLOAD/CSV] ${parseResult.transactions.length} transactions | mode=${parseResult.parseMode}`);
        // Warn if all rows are low-confidence (positional mode)
        const allLow = parseResult.transactions.every(t => t.confidence === 'low');
        return NextResponse.json({
          ok: true,
          data: {
            transactions: parseResult.transactions,
            source:       'bank',
            parseMode:    parseResult.parseMode,
            warning:      parseResult.warning ?? (allLow ? 'Column structure unclear — all transactions need review.' : undefined),
          },
        });
      }
      // No transactions found — fall through to single-receipt parse
      console.log('[UPLOAD/CSV] Zero transactions extracted — trying single-receipt parser');
    }

    // ── PDF: try hardened bank-statement row parser, then single-receipt parse ─
    if (isPDF) {
      const parseResult = parsePDFBankText(rawText, todayDate);
      if (parseResult.transactions.length > 1) {
        console.log(`[UPLOAD/PDF] Bank statement: ${parseResult.transactions.length} transactions`);
        const allLow = parseResult.transactions.every(t => t.confidence === 'low');
        return NextResponse.json({
          ok: true,
          data: {
            transactions: parseResult.transactions,
            source:       'bank',
            parseMode:    'pdf-lines',
            warning:      parseResult.warning ?? (allLow ? 'PDF column structure unclear — all transactions need review.' : undefined),
          },
        });
      }
      // Single transaction or receipt PDF → receipt parser
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
          date:        todayDate,
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

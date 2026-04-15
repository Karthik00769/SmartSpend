/**
 * app/api/expenses/scan/route.ts
 * POST /api/expenses/scan
 *
 * Pipeline:
 *  1. Receive image (JPEG / PNG / WebP)
 *  2. Preprocess with Sharp (multi-pass: gentle → aggressive → ultra)
 *  3. Run Tesseract OCR on best result
 *  4. Parse with improved receipt-parser engine
 *  5. Validate amount (1 ≤ x ≤ 1,00,000)
 *  6. Return structured data or "needs manual review" signal
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import path                          from 'node:path';
import { pathToFileURL }             from 'node:url';
import { parseReceiptText, cleanOCRText } from '@/lib/ocr/receipt-parser';

const NM = path.join(process.cwd(), 'node_modules');
const TESSERACT_WORKER = path.join(NM, 'tesseract.js/src/worker-script/node/index.js');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES   = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ─── Sharp preprocessing passes ──────────────────────────────────────────────
// We run up to 3 passes and keep the OCR result with the most text / best
// confidence. Each pass progressively increases contrast for harder images.

interface PreprocessPass {
  name:       string;
  transform:  (sharp: any, buf: Buffer) => Promise<Buffer>;
}

function buildPreprocessPasses(sharp: any, buf: Buffer): PreprocessPass[] {
  return [
    // Pass 1 — Gentle: good for clean, high-contrast images
    {
      name: 'gentle',
      transform: async (s, b) =>
        s(b)
          .grayscale()
          .normalize()                         // auto levels
          .sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 })
          .png({ compressionLevel: 1 })
          .toBuffer(),
    },
    // Pass 2 — Contrast boost: thermal receipts and faded prints
    {
      name: 'contrast-boost',
      transform: async (s, b) =>
        s(b)
          .grayscale()
          .normalize()
          .linear(1.6, -(128 * 0.6))           // brightness/contrast equivalent
          .sharpen({ sigma: 1.5 })
          .png({ compressionLevel: 1 })
          .toBuffer(),
    },
    // Pass 3 — Hard threshold (binarize): dark/dirty receipts
    {
      name: 'threshold',
      transform: async (s, b) =>
        s(b)
          .grayscale()
          .normalize()
          .threshold(145)                       // binary black/white
          .png({ compressionLevel: 1 })
          .toBuffer(),
    },
  ];
}

// ─── OCR runner ──────────────────────────────────────────────────────────────

interface OCRResult {
  text:       string;
  confidence: number;
  pass:       string;
}

async function runOCR(buffer: Buffer): Promise<OCRResult> {
  const sharp = require('sharp');
  const Tesseract = require('tesseract.js');
  const workerPath = pathToFileURL(TESSERACT_WORKER);

  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath,
    preserve_interword_spaces: '1',
  });

  // Configure Tesseract for receipt layout (single column, mixed sizes)
  await worker.setParameters({
    tessedit_pageseg_mode:       '6',   // assume single uniform block of text
    tessedit_char_whitelist:     '',    // allow all chars
    preserve_interword_spaces:   '1',
  });

  const passes = buildPreprocessPasses(sharp, buffer);
  let best: OCRResult = { text: '', confidence: 0, pass: 'none' };

  for (const pass of passes) {
    try {
      const preprocessed = await pass.transform(sharp, buffer);
      const { data: { text, confidence } } = await worker.recognize(preprocessed);
      const cleaned = cleanOCRText(text);
      const textLen  = cleaned.trim().length;

      console.log(`[SCAN/${pass.name}] conf=${confidence?.toFixed(0) ?? '?'} chars=${textLen}`);

      // Keep this pass if it gives more text OR significantly higher confidence
      if (
        textLen > best.text.trim().length * 1.15 ||  // 15% more chars
        (confidence > best.confidence + 10 && textLen > 20)
      ) {
        best = { text: cleaned, confidence: confidence ?? 0, pass: pass.name };
      }

      // If confidence is already great, stop early
      if (best.confidence >= 80 && best.text.trim().length > 100) break;

    } catch (err: any) {
      console.warn(`[SCAN/${pass.name}] Failed:`, err?.message ?? err);
    }
  }

  await worker.terminate();
  return best;
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
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'File too large (max 10 MB).' }, { status: 413 });
    }

    const mimeType = file.type.toLowerCase();
    const ext      = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isImage  = IMAGE_TYPES.has(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    if (!isImage) {
      return NextResponse.json(
        { ok: false, error: 'Only image files are supported for receipt scanning.' },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Step 1: Run multi-pass OCR ──────────────────────────────────────────
    let ocrResult: OCRResult;
    try {
      ocrResult = await runOCR(buffer);
    } catch (err: any) {
      console.error('[SCAN] OCR pipeline failed:', err);
      return NextResponse.json({ ok: false, error: 'OCR processing failed.' }, { status: 422 });
    }

    const { text: rawText, confidence: ocrConf, pass: bestPass } = ocrResult;
    console.log(`[SCAN] Best OCR pass: ${bestPass} | conf=${ocrConf.toFixed(0)} | chars=${rawText.trim().length}`);
    console.log('[SCAN] Text preview:', rawText.slice(0, 400).replace(/\n/g, ' | '));

    if (!rawText || rawText.trim().length < 5) {
      return NextResponse.json(
        { ok: false, error: 'Could not extract text from this image. Try a clearer photo.' },
        { status: 422 },
      );
    }

    // ── Step 2: Parse with improved engine ─────────────────────────────────
    const parsed = parseReceiptText(rawText);

    // ── Step 3: Expense date is always today (server-enforced) ─────────────
    const date = new Date().toISOString().slice(0, 10);

    // ── Step 4: Build response ─────────────────────────────────────────────
    // errorMessage comes from the parser for hard-failure (no amount found)
    // amountWarning comes from low-confidence extraction
    const amountWarning = parsed.errorMessage
      ?? (parsed.needsReview && parsed.amount > 0
          ? 'Amount detected but confidence is low — please verify before saving.'
          : null);

    return NextResponse.json({
      ok: true,
      data: {
        extracted: {
          amount:      parsed.amount,
          date,
          merchant:    parsed.merchant,
          description: parsed.description,
        },
        source:      'ocr',
        confidence:  parsed.confidence,
        needsReview: parsed.needsReview,
        amountWarning,
        // Debug info (stripped in production builds if needed)
        _debug: {
          ocrPass:       bestPass,
          ocrConfidence: Math.round(ocrConf),
          textLength:    rawText.trim().length,
          rawSnippet:    parsed.rawSnippet,
        },
      },
    });

  } catch (err: any) {
    console.error('[SCAN] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

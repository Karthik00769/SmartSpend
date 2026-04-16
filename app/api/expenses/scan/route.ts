/**
 * app/api/expenses/scan/route.ts
 * POST /api/expenses/scan
 *
 * Updated Pipeline (STEP-BY-STEP):
 *  1. Receive image (JPEG / PNG / WebP)
 *  2. OpenCV preprocessing → 3 enhanced variants
 *     (adaptive threshold / aggressive boost / edge-enhanced, all deskewed + 2×)
 *  3. Sharp classic pipeline (3 passes) as fallback
 *  4. Run Tesseract OCR on ALL candidates; pick best (text length + confidence)
 *  5. Parse with receipt-parser engine
 *  6. Validate amount (1 ≤ x ≤ 1,00,000)
 *  7. Return structured data or "needs manual review" signal
 *
 * FALLBACK: If OpenCV preprocessing fails, falls through to existing Sharp pipeline.
 * API response shape is identical — no UI changes required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import path                          from 'node:path';
import { pathToFileURL }             from 'node:url';
import { parseReceiptTextWithLearning, cleanOCRText } from '@/lib/ocr/receipt-parser';

import { preprocessImageWithOpenCV }      from '@/lib/ocr/opencv-preprocess';

const NM = path.join(process.cwd(), 'node_modules');
const TESSERACT_WORKER = path.join(NM, 'tesseract.js/src/worker-script/node/index.js');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES   = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ─── Classic Sharp fallback passes ───────────────────────────────────────────
// Used when OpenCV preprocessing fails or produces no variants.
// Each pass progressively increases contrast.

interface PreprocessPass {
  name:      string;
  getBuffer: (sharp: any, buf: Buffer) => Promise<Buffer>;
}

function buildSharpFallbackPasses(sharp: any, buf: Buffer): PreprocessPass[] {
  return [
    {
      name:      'sharp-gentle',
      getBuffer: async (s, b) =>
        s(b).grayscale().normalize().sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 }).png({ compressionLevel: 1 }).toBuffer(),
    },
    {
      name:      'sharp-contrast',
      getBuffer: async (s, b) =>
        s(b).grayscale().normalize().linear(1.6, -(128 * 0.6)).sharpen({ sigma: 1.5 }).png({ compressionLevel: 1 }).toBuffer(),
    },
    {
      name:      'sharp-threshold',
      getBuffer: async (s, b) =>
        s(b).grayscale().normalize().threshold(145).png({ compressionLevel: 1 }).toBuffer(),
    },
  ];
}

// ─── OCR runner ──────────────────────────────────────────────────────────────

interface OCRCandidate {
  text:       string;
  confidence: number;
  pass:       string;
}

/**
 * runOCR
 * Multi-stage OCR pipeline:
 *  1. Run OpenCV preprocessing → up to 3 enhanced variants (adaptive threshold,
 *     aggressive boost, edge-enhanced), all deskewed and 2× upscaled.
 *  2. If OpenCV produces no variants, fall through to classic Sharp pipeline.
 *  3. Run Tesseract on ALL candidate buffers.
 *  4. Pick the result with most text AND highest confidence.
 */
async function runOCR(buffer: Buffer): Promise<OCRCandidate> {
  const sharp     = require('sharp');
  const Tesseract = require('tesseract.js');
  const workerPath = pathToFileURL(TESSERACT_WORKER);

  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath,
    preserve_interword_spaces: '1',
  });
  await worker.setParameters({
    tessedit_pageseg_mode:     '6',   // single uniform text block
    tessedit_char_whitelist:   '',    // allow all chars
    preserve_interword_spaces: '1',
  });

  let best: OCRCandidate = { text: '', confidence: 0, pass: 'none' };

  // ── Helper: try a prepared buffer, update best if better ─────────────────
  const tryBuffer = async (prepared: Buffer, passName: string) => {
    try {
      const { data: { text, confidence } } = await worker.recognize(prepared);
      const cleaned = cleanOCRText(text);
      const textLen = cleaned.trim().length;
      const conf    = confidence ?? 0;

      console.log(`[SCAN/${passName}] conf=${conf.toFixed(0)} chars=${textLen}`);

      // Prefer: significantly more text, OR much higher confidence
      if (
        textLen > best.text.trim().length * 1.15 ||
        (conf > best.confidence + 10 && textLen > 20)
      ) {
        best = { text: cleaned, confidence: conf, pass: passName };
      }
    } catch (e: any) {
      console.warn(`[SCAN/${passName}] Skipped:`, e?.message ?? e);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 1 — OpenCV preprocessing variants (adaptive threshold + deskew)
  // ══════════════════════════════════════════════════════════════════════════
  let opencvUsed = false;
  try {
    const cvVariants = await preprocessImageWithOpenCV(buffer);

    if (cvVariants.length > 0) {
      opencvUsed = true;
      for (const variant of cvVariants) {
        await tryBuffer(variant.buffer, `opencv-${variant.variantName}`);
        // Early exit: if first variant already got excellent OCR, no need to continue
        if (best.confidence >= 85 && best.text.trim().length > 150) break;
      }
      console.log(`[SCAN] OpenCV stage: ${cvVariants.length} variants, best=${best.pass} conf=${best.confidence.toFixed(0)}`);
    } else {
      console.log('[SCAN] OpenCV returned no variants — using Sharp fallback.');
    }
  } catch (err: any) {
    console.warn('[SCAN] OpenCV preprocessing threw:', err?.message ?? err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 2 — Classic Sharp fallback passes
  // Always runs; may improve on OpenCV result for clean images.
  // Skipped early if OpenCV already achieved high confidence.
  // ══════════════════════════════════════════════════════════════════════════
  if (!opencvUsed || best.confidence < 80 || best.text.trim().length < 100) {
    const sharpPasses = buildSharpFallbackPasses(sharp, buffer);
    for (const pass of sharpPasses) {
      try {
        const prepared = await pass.getBuffer(sharp, buffer);
        await tryBuffer(prepared, pass.name);
        if (best.confidence >= 80 && best.text.trim().length > 100) break; // good enough
      } catch (e: any) {
        console.warn(`[SCAN/${pass.name}] Failed:`, e?.message ?? e);
      }
    }
  }

  await worker.terminate();

  console.log(`[SCAN] Final winner: pass="${best.pass}" conf=${best.confidence.toFixed(0)} chars=${best.text.trim().length}`);
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

    // ── Step 1: Run multi-pass OCR with Hard Timeout ───────────────────────
    const TIMEOUT_MS = 10000;
    let ocrResult: OCRCandidate;
    
    try {
      ocrResult = await Promise.race([
        runOCR(buffer),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OCR_TIMEOUT')), TIMEOUT_MS)
        ),
      ]);
    } catch (err: any) {
      if (err.message === 'OCR_TIMEOUT') {
        console.error('[SCAN] OCR timed out after 10s');
        return NextResponse.json(
          { ok: false, error: 'OCR_TIMEOUT', message: 'Scanning took too long. Please try again.' },
          { status: 504 }
        );
      }
      console.error('[SCAN] OCR pipeline failed:', err);
      return NextResponse.json({ ok: false, error: 'OCR processing failed.' }, { status: 422 });
    }

    const { text: rawText, confidence: ocrConf, pass: bestPass } = ocrResult;
    console.log(`[SCAN] Best OCR pass: ${bestPass} | conf=${ocrConf.toFixed(0)} | chars=${rawText.trim().length}`);

    if (!rawText || rawText.trim().length < 20) {
      return NextResponse.json(
        { ok: false, message: 'Unable to detect receipt clearly.' },
        { status: 422 },
      );
    }

    // STEP 2: Parse with contextual engine + learning correction
    const parsed = await parseReceiptTextWithLearning(rawText);


    // ── Step 3: Expense date is always today (server-enforced) ─────────────


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
          date:        parsed.date,
          merchant:    parsed.merchant,
          description: parsed.description,
          dateAdjusted: parsed.dateAdjusted,
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
          extractedDate: parsed.date,
        },
      },
    });

  } catch (err: any) {
    console.error('[SCAN] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

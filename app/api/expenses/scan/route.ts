/**
 * app/api/expenses/scan/route.ts
 * POST /api/expenses/scan
 *
 * Simplified OCR pipeline – single preprocessing step and single Tesseract call.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseReceiptTextWithLearning, cleanOCRText } from '@/lib/ocr/receipt-parser';
import { preprocessImageWithOpenCV } from '@/lib/ocr/opencv-preprocess';

const NM = path.join(process.cwd(), 'node_modules');
const TESSERACT_WORKER = path.join(NM, 'tesseract.js/src/worker-script/node/index.js');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Simple OCR runner – resize 2×, grayscale, threshold, then Tesseract. */
interface OCRCandidate {
  text: string;
  confidence: number;
  pass: string;
}

async function runOCR(buffer: Buffer): Promise<OCRCandidate> {
  const sharp = require('sharp');
  const Tesseract = require('tesseract.js');
  const workerPath = pathToFileURL(TESSERACT_WORKER);

  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath,
    preserve_interword_spaces: '1',
  });
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  });

  const candidates: OCRCandidate[] = [];

  const tryBuffer = async (buf: Buffer, pass: string) => {
    try {
      const { data: { text, confidence } } = await worker.recognize(buf);
      const cleaned = cleanOCRText(text);
      candidates.push({ text: cleaned, confidence: confidence ?? 0, pass });
    } catch (e: any) {
      console.warn(`[OCR/${pass}] skip:`, e?.message);
    }
  };

  try {
    // 1 & 2: OpenCV Adaptive Threshold, Enhanced Edge, and Contrast Variants
    const cvVariants = await preprocessImageWithOpenCV(buffer);
    for (const v of cvVariants) {
      await tryBuffer(v.buffer, `opencv-${v.variantName}`);
    }

    // Baseline Grayscale + Threshold (Fallback/Variant 4)
    const meta = await sharp(buffer).metadata();
    const width = meta.width ? Math.round(meta.width * 2) : undefined;
    const preprocessed = await sharp(buffer)
      .resize({ width })
      .grayscale()
      .threshold(150)
      .toBuffer();
    await tryBuffer(preprocessed, 'sharp-baseline');

    // SCORING: confidence (40%), currency/amount (30%), keywords (30%)
    let bestScore = -1;
    let bestCandidate: OCRCandidate | null = null;

    for (const cand of candidates) {
      const lower = cand.text.toLowerCase();

      let keywordCount = 0;
      if (lower.includes('total')) keywordCount++;
      if (lower.includes('amount')) keywordCount++;
      if (lower.includes('paid')) keywordCount++;
      const keywordScore = Math.min(keywordCount / 2, 1) * 30; // Max 30 points

      let currencyScore = 0;
      if (/[\$\£\€\₹]/.test(lower) || /rs\.?|inr|usd/.test(lower) || /\d+\.\d{2}/.test(lower)) {
        currencyScore = 30; // Max 30 points
      }

      const confScore = (cand.confidence / 100) * 40; // Max 40 points

      const totalScore = confScore + keywordScore + currencyScore;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestCandidate = cand;
      }
    }

    return bestCandidate ?? candidates[0] ?? { text: '', confidence: 0, pass: 'none' };
  } finally {
    await worker.terminate();
  }
}

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
    const ocrResult = await runOCR(buffer);
    const { text: rawText, confidence: ocrConf, pass: bestPass } = ocrResult;
    console.log(`[SCAN] OCR pass=${bestPass} conf=${ocrConf.toFixed(0)} chars=${rawText.trim().length}`);

    if (!rawText || rawText.trim().length < 20) {
      return NextResponse.json({ ok: false, message: 'Unable to detect receipt clearly.' }, { status: 422 });
    }

    const parsed = await parseReceiptTextWithLearning(rawText);
    const amountWarning = parsed.errorMessage ??
      (parsed.needsReview && parsed.amount > 0 ? 'Amount detected but confidence is low — verify before saving.' : null);

    return NextResponse.json({
      ok: true,
      data: {
        extracted: {
          amount: parsed.amount,
          date: parsed.date,
          merchant: parsed.merchant,
          description: parsed.description,
          dateAdjusted: parsed.dateAdjusted,
        },
        source: 'ocr',
        confidence: parsed.confidence,
        needsReview: parsed.needsReview,
        amountWarning,
        _debug: {
          ocrPass: bestPass,
          ocrConfidence: Math.round(ocrConf),
          textLength: rawText.trim().length,
          rawSnippet: parsed.rawSnippet,
          extractedDate: parsed.date,
        },
      },
    });
  } catch (err: any) {
    console.error('[SCAN] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

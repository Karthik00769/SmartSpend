/**
 * app/api/expenses/scan/route.ts
 * POST /api/expenses/scan
 * Accepts image files, runs Tesseract OCR, returns extracted fields.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import path                          from 'node:path';
import { pathToFileURL }             from 'node:url';

const NM = path.join(process.cwd(), 'node_modules');
const TESSERACT_WORKER = path.join(NM, 'tesseract.js/src/worker-script/node/index.js');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES   = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ─── Parsers (shared logic, same as upload route) ────────────────────────────

function extractAmount(text: string): number {
  // Priority 1: keyword + number on the same line
  const keywordPatterns = [
    /(?:grand\s*total|total\s*due|amount\s*due|total\s*amount|net\s*amount|balance\s*due|bill\s*amount|net\s*payable|payable|total)[^\d₹Rs\n]{0,10}[₹Rs.INR]*\s*([\d,]+\.?\d{0,2})/i,
    /(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d{0,2})/i,
    /([\d,]+\.?\d{0,2})\s*(?:₹|Rs\.?|INR)\b/i,
    /[$£€]\s*([\d,]+\.\d{2})/,
  ];
  for (const pat of keywordPatterns) {
    const m = text.match(pat);
    if (m) {
      const raw = (m[1] ?? m[0]).replace(/[^\d.]/g, '');
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0 && val < 1_000_000) return val;
    }
  }

  // Priority 2: scan line-by-line for lines that look like "Label  123.45"
  // Prefer lines with total/amount keywords
  const lines = text.split('\n');
  for (const line of lines) {
    if (!/total|amount|payable|due|net|bill/i.test(line)) continue;
    const nums = line.match(/[\d,]+\.\d{2}/g);
    if (nums) {
      const val = parseFloat(nums[nums.length - 1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && val < 1_000_000) return val;
    }
  }

  // Priority 3: all decimal numbers — pick the one most likely to be a total
  // (avoid phone numbers: 10-digit, avoid years: 4-digit starting with 20)
  const decimals = text.match(/\b\d{1,6}\.\d{2}\b/g);
  if (decimals && decimals.length > 0) {
    const parsed = decimals
      .map(a => parseFloat(a.replace(/,/g, '')))
      .filter(n => !isNaN(n) && n >= 1 && n < 1_000_000);
    if (parsed.length > 0) return Math.max(...parsed);
  }

  // Priority 4: whole numbers that look like amounts (not phone/PIN/year)
  const wholes = text.match(/\b[1-9]\d{1,5}\b/g);
  if (wholes) {
    const parsed = wholes
      .map(a => parseFloat(a))
      .filter(n => n >= 10 && n < 100_000 && !(n >= 2000 && n <= 2100));
    if (parsed.length > 0) return Math.max(...parsed);
  }

  return 0;
}

function extractDate(text: string): string {
  const today = new Date().toISOString().split('T')[0];
  const patterns: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => string | null }> = [
    {
      re: /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
      parse: m => `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`,
    },
    {
      re: /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/,
      parse: m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`,
    },
    {
      re: /\b(0?[1-9]|[12]\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i,
      parse: m => { const d = new Date(`${m[2]} ${m[1]} ${m[3]}`); return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]; },
    },
    {
      re: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/i,
      parse: m => { const d = new Date(`${m[1]} ${m[2]} ${m[3]}`); return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]; },
    },
    {
      re: /\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](\d{2})\b/,
      parse: m => { const d = new Date(`20${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`); return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]; },
    },
  ];
  for (const { re, parse } of patterns) {
    const m = text.match(re);
    if (m) {
      try {
        const result = parse(m);
        if (result) {
          const d = new Date(result);
          if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) return result;
        }
      } catch { /* try next */ }
    }
  }
  return today;
}

function extractMerchant(text: string): string {
  const skipWords = [
    'receipt','invoice','tax','total','amount','date','time','page','order',
    'duplicate','customer','cashier','terminal','auth','thank','welcome',
    'please','visit','gst','vat','subtotal','visa','mastercard','amex',
    'rupee','payment','bill','cash','change','balance','paid','transaction',
    'ref','upi','neft','imps','ifsc','account','bank','no.','number',
  ];
  const lines = text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 3 && l.length <= 60);

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line  = lines[i];
    const lower = line.toLowerCase();
    if (/^[\d\s₹$€£.,:\-/]+$/.test(line)) continue;
    if (/^[$₹€£¥]/.test(line)) continue;
    if (skipWords.some(kw => lower.includes(kw))) continue;
    if (/\b\d{6,}\b/.test(line)) continue; // phone/PIN/account numbers
    const cleaned = line.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z0-9\s&'.\-]+$/, '').trim();
    if (cleaned.length >= 3 && /[a-zA-Z]{2,}/.test(cleaned)) return cleaned;
  }
  // fallback: longest line with letters
  const withLetters = lines
    .filter(l => /[a-zA-Z]{3,}/.test(l) && !/total|amount|date|tax/i.test(l))
    .sort((a, b) => b.length - a.length);
  return withLetters[0]?.trim() || '';
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

    if (!file) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File too large (max 10 MB).' }, { status: 413 });

    const mimeType = file.type.toLowerCase();
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isImage = IMAGE_TYPES.has(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    if (!isImage) {
      return NextResponse.json({ ok: false, error: 'Only image files are supported for receipt scanning.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Sharp preprocessing: two passes ────────────────────────────────────
    // Pass 1: gentle (grayscale + normalize + mild sharpen) — good for most receipts
    // Pass 2: aggressive (threshold) — only used if pass 1 gives poor results
    let rawText = '';
    try {
      const sharp = require('sharp');

      // Gentle pass — preserves grey tones, better for thermal receipts
      const gentleBuffer = await sharp(buffer)
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.0 })
        .png()
        .toBuffer();

      const Tesseract = require('tesseract.js');
      const workerPath = pathToFileURL(TESSERACT_WORKER);
      const worker = await Tesseract.createWorker('eng', 1, {
        workerPath,
        preserve_interword_spaces: '1',
      });
      const { data: { text, confidence } } = await worker.recognize(gentleBuffer);
      rawText = text;

      // If confidence is low, retry with binarized image
      if ((confidence ?? 100) < 60 && rawText.trim().length < 50) {
        const hardBuffer = await sharp(buffer)
          .grayscale()
          .normalize()
          .threshold(140)
          .png()
          .toBuffer();
        const { data: { text: text2 } } = await worker.recognize(hardBuffer);
        if (text2.trim().length > rawText.trim().length) rawText = text2;
      }

      await worker.terminate();
    } catch (err: any) {
      console.error('[SCAN/TESSERACT] Failed:', err);
      return NextResponse.json({ ok: false, error: 'OCR processing failed.' }, { status: 422 });
    }

    console.log('[SCAN] Raw OCR text:', rawText.substring(0, 600).replace(/\n/g, ' | '));

    if (!rawText || rawText.trim().length < 5) {
      return NextResponse.json({ ok: false, error: 'Could not extract text from this image.' }, { status: 422 });
    }

    const amount   = extractAmount(rawText);
    const date     = extractDate(rawText);
    const merchant = extractMerchant(rawText);

    console.log('[SCAN] Parsed → amount:', amount, '| date:', date, '| merchant:', merchant);

    const amountWarning = amount === 0
      ? 'Could not detect an amount — please enter it manually.'
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        extracted: { amount, date, merchant, description: merchant },
        source: 'ocr',
        amountWarning,
      },
    });

  } catch (err: any) {
    console.error('[SCAN] Error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

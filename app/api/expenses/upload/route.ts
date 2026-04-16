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
  parseReceiptText,
  cleanOCRText,
  detectCSVDelimiter,
  splitCSVLine,
  detectCSVColumns,
  parseRawAmount,
  validateCSVAmount,
  parsePDFBankStatement,
} from '@/lib/ocr/receipt-parser';
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

// ─── CSV multi-transaction parser ────────────────────────────────────────────

export interface ParsedTransaction {
  amount:      number;
  date:        string;  // always today
  description: string;
}

/**
 * parseCSVTransactions
 * Parses a CSV/TSV/tabular text file into individual transactions.
 *
 * Features:
 *  - Auto-detects delimiter (tab / pipe / semicolon / comma)
 *  - Dynamically maps columns by header keyword matching
 *  - Handles separate debit/credit columns (some banks)
 *  - Per-row validation: amount must be 1–1,00,000
 *  - Falls back to positional inference if no headers found
 *  - All dates are forced to today
 */
function parseCSVTransactions(text: string): ParsedTransaction[] {
  try {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // ── Detect delimiter ───────────────────────────────────────────────────
    const delim = detectCSVDelimiter(lines);
    const split  = (line: string) => splitCSVLine(line, delim);

    // ── Parse headers ──────────────────────────────────────────────────────
    const headerRow    = split(lines[0]);
    const colMap       = detectCSVColumns(headerRow);

    console.log(
      `[CSV] delim="${delim === '\t' ? 'TAB' : delim}"`,
      `| dateCol=${colMap.dateCol}`,
      `| amtCol=${colMap.amountCol}`,
      `| debitCol=${colMap.debitCol}`,
      `| creditCol=${colMap.creditCol}`,
      `| descCol=${colMap.descCol}`,
      `| headers=[${headerRow.join(' | ')}]`,
    );

    // If no amount column at all, fall back to positional parser
    const hasAmountInfo = colMap.amountCol !== -1 || colMap.debitCol !== -1 || colMap.creditCol !== -1;
    if (!hasAmountInfo) {
      console.log('[CSV] No amount column found, using positional parser');
      return parsePositional(lines, split);
    }

    // ── Detect balance column to EXCLUDE it from amount resolution ──────────
    // Balance columns often have large numbers that look like transaction amounts
    const balanceCol = (() => {
      const h = headerRow.map(x => x.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim());
      const balanceCandidates = [
        'balance', 'closing balance', 'available balance', 'running balance',
        'balance amount', 'bal', 'ledger balance', 'book balance',
      ];
      for (const c of balanceCandidates) {
        const idx = h.findIndex(hdr => hdr === c || hdr.includes(c));
        if (idx !== -1) {
          console.log(`[CSV] Balance column detected at index ${idx}: "${headerRow[idx]}"`);
          return idx;
        }
      }
      return -1;
    })();

    const transactions: ParsedTransaction[] = [];
    let skipped = 0;
    const todayDate = new Date().toISOString().slice(0, 10);

    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = split(lines[i]);

        // Skip rows too short to have all needed columns
        const maxNeeded = Math.max(
          colMap.amountCol, colMap.debitCol, colMap.creditCol,
          colMap.descCol,
        );
        if (cols.length <= Math.max(0, maxNeeded)) { skipped++; continue; }

        // Skip header-repeat rows (common in bank statements)
        const firstCell = (cols[0] ?? '').toLowerCase();
        if (/^(date|sl|sr|no|#|s\.no|sno)/.test(firstCell)) { skipped++; continue; }

        // Skip fully empty rows
        if (cols.every(c => !c.trim())) { skipped++; continue; }

        // ── Resolve amount — strict debit/credit/amount priority (Task 4) ────
        let amount = 0;

        // RULE: if both debit and credit exist, debit > 0 wins (it's an expense)
        if (colMap.debitCol !== -1 && colMap.creditCol !== -1) {
          const debit  = parseRawAmount(cols[colMap.debitCol]  ?? '');
          const credit = parseRawAmount(cols[colMap.creditCol] ?? '');
          // Debit (withdrawal) = expense; credit (deposit) = income — skip credits
          amount = debit > 0 ? debit : 0;
          if (amount === 0) { skipped++; continue; } // credit-only row, skip
        } else if (colMap.debitCol !== -1) {
          amount = parseRawAmount(cols[colMap.debitCol] ?? '');
        } else if (colMap.amountCol !== -1) {
          // Single amount column: make sure we're NOT reading from balance column
          if (colMap.amountCol !== balanceCol) {
            amount = parseRawAmount(cols[colMap.amountCol] ?? '');
          }
        }

        // Never use balance column as amount
        if (balanceCol !== -1 && amount === 0) {
          // If we still have no amount, skip — don't pull from balance
          skipped++;
          continue;
        }

        // Validate amount range [1, 100000]
        if (!validateCSVAmount(amount)) {
          console.log(`[CSV] Row ${i}: skipped — amount ${amount} out of range [1, 100000]`);
          skipped++;
          continue;
        }

        // ── Resolve description (must be ≥ 3 chars) ───────────────────────────
        let description = '';
        if (colMap.descCol !== -1) {
          description = (cols[colMap.descCol] ?? '').trim();
        }
        // If no desc col or empty, concatenate non-amount non-date cols
        if (!description || description.length < 3) {
          description = cols
            .filter((_, idx) =>
              idx !== colMap.amountCol && idx !== colMap.debitCol &&
              idx !== colMap.creditCol && idx !== colMap.dateCol &&
              idx !== balanceCol
            )
            .join(' ')
            .trim()
            .slice(0, 100);
        }

        // RULE: valid transaction must have description length > 3
        if (description.length < 3) {
          description = 'Bank transaction';
        }

        transactions.push({ amount, date: todayDate, description });

      } catch (rowErr: any) {
        console.log(`[CSV] Row ${i}: parse error — ${rowErr?.message ?? rowErr}`);
        skipped++;
      }
    }

    if (skipped > 0) {
      console.log(`[CSV] Skipped ${skipped} rows, extracted ${transactions.length} valid transactions`);
    }
    return transactions;

  } catch (err: any) {
    console.error('[CSV] Fatal parse error:', err?.message ?? err);
    return [];
  }
}

// ─── Positional fallback ─────────────────────────────────────────────────────

function parsePositional(
  lines: string[],
  split: (l: string) => string[],
): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const todayDate = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < lines.length; i++) {
    try {
      const cols = split(lines[i]);
      if (cols.length < 2) continue;

      // Find last column that parses to a valid expense amount
      let amount = 0;
      let amtColIdx = -1;
      for (let c = cols.length - 1; c >= 0; c--) {
        const v = parseRawAmount(cols[c]);
        if (validateCSVAmount(v)) { amount = v; amtColIdx = c; break; }
      }
      if (!amount) continue;

      // Description: all other columns joined
      const description = cols
        .filter((_, c) => c !== amtColIdx)
        .join(' ')
        .trim()
        .replace(/\s{2,}/g, ' ')
        .slice(0, 100) || 'Bank transaction';

      transactions.push({ amount, date: todayDate, description });
    } catch { /* skip row */ }
  }
  return transactions;
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

    // ── IMAGE — multi-pass sharp + tesseract ──────────────────────────────
    if (isImage) {
      try {
        const workerPath = pathToFileURL(TESSERACT_WORKER).href;

        const passes = [
          { name: 'gentle',         fn: () => sharp(buffer).grayscale().normalize().sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 }).png({ compressionLevel: 1 }).toBuffer() },
          { name: 'contrast-boost', fn: () => sharp(buffer).grayscale().normalize().linear(1.6, -(128 * 0.6)).sharpen({ sigma: 1.5 }).png({ compressionLevel: 1 }).toBuffer() },
          { name: 'threshold',      fn: () => sharp(buffer).grayscale().normalize().threshold(145).png({ compressionLevel: 1 }).toBuffer() },
        ];

        const worker = await Tesseract.createWorker('eng', 1, { workerPath });
        await worker.setParameters({ 
          tessedit_pageseg_mode: '6' as any,
          preserve_interword_spaces: '1',
        });

        let bestText = '';
        let bestConf = 0;

        for (const p of passes) {
          try {
            const prep = await p.fn();
            const { data: { text, confidence } } = await worker.recognize(prep);
            const cleaned = cleanOCRText(text);
            const tLen = cleaned.trim().length;
            console.log(`[UPLOAD/${p.name}] conf=${(confidence ?? 0).toFixed(0)} chars=${tLen}`);

            if (tLen > bestText.trim().length * 1.15 || (confidence > bestConf + 10 && tLen > 20)) {
              bestText = cleaned;
              bestConf = confidence ?? 0;
            }
            if (bestConf >= 80 && bestText.trim().length > 100) break;
          } catch (e: any) { console.warn(`[UPLOAD/${p.name}] skip:`, e?.message); }
        }

        await worker.terminate();
        rawText = bestText;
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

    // ── CSV / TSV: try multi-transaction path first ────────────────────────
    if (isText) {
      const transactions = parseCSVTransactions(rawText);
      if (transactions.length > 0) {
        console.log(`[UPLOAD/CSV] Returning ${transactions.length} transactions`);
        return NextResponse.json({ ok: true, data: { transactions, source: 'bank' } });
      }
    }

    // ── PDF: try bank-statement row parser first, then single-receipt parse ─
    if (isPDF) {
      // For digital PDFs with many lines, try the row-wise bank statement parser
      const transactions = parsePDFBankStatement(rawText, todayDate);
      if (transactions.length > 1) {
        console.log(`[UPLOAD/PDF] Bank statement: returning ${transactions.length} transactions`);
        return NextResponse.json({ ok: true, data: { transactions, source: 'bank' } });
      }
      // Single transaction or single-receipt PDF → fall through to receipt parser below
      console.log('[UPLOAD/PDF] Single-entry PDF — using receipt parser');
    }

    // ── Single-transaction fallback (image receipt / single-entry PDF) ──────
    const parsed = parseReceiptText(rawText);

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

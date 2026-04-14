/**
 * app/api/expenses/upload/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * POST /api/expenses/upload
 *
 * Accepts: multipart/form-data with a "file" field.
 * Supported file types:
 *   - PDF  → extract via pdfjs-dist (legacy build to prevent DOMMatrix)
 *   - Images → extract via tesseract.js
 *   - CSV / TXT → UTF-8 plain text extraction
 *
 * IMPORTANT: This route NEVER saves to the database.
 * Response: { ok: true, data: { extracted: { ... } } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Worker path for Tesseract — built from process.cwd() so webpack cannot intercept it
const NM = path.join(process.cwd(), 'node_modules');
const TESSERACT_WORKER = path.join(NM, 'tesseract.js/src/worker-script/node/index.js');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE = 'application/pdf';
const TEXT_TYPES = new Set(['text/csv', 'text/plain']);

// ─── Deterministic Pure-Node Regex Parsers ──────────────────────────────────

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

  // Priority 2: line-by-line scan for total/amount keyword lines
  const lines = text.split('\n');
  for (const line of lines) {
    if (!/total|amount|payable|due|net|bill/i.test(line)) continue;
    const nums = line.match(/[\d,]+\.\d{2}/g);
    if (nums) {
      const val = parseFloat(nums[nums.length - 1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && val < 1_000_000) return val;
    }
  }

  // Priority 3: decimal numbers (most reliable — avoids phone/PIN/year)
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

  // Ordered by specificity — most specific first
  const patterns: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => string | null }> = [
    // YYYY-MM-DD or YYYY/MM/DD
    {
      re: /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
      parse: m => `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`,
    },
    // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY (Indian format)
    {
      re: /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/,
      parse: m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`,
    },
    // DD MMM YYYY  e.g. 05 Apr 2026 or 5 April 2026
    {
      re: /\b(0?[1-9]|[12]\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i,
      parse: m => {
        const d = new Date(`${m[2]} ${m[1]} ${m[3]}`);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      },
    },
    // MMM DD, YYYY  e.g. Apr 05, 2026
    {
      re: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/i,
      parse: m => {
        const d = new Date(`${m[1]} ${m[2]} ${m[3]}`);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      },
    },
    // MM/DD/YY — least reliable, try last
    {
      re: /\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](\d{2})\b/,
      parse: m => {
        const d = new Date(`20${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      },
    },
  ];

  for (const { re, parse } of patterns) {
    const m = text.match(re);
    if (m) {
      try {
        const result = parse(m);
        if (result) {
          const d = new Date(result);
          if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
            return result;
          }
        }
      } catch { /* try next pattern */ }
    }
  }

  return today;
}

function extractMerchant(text: string): string {
  const skipWords = [
    'receipt', 'invoice', 'tax', 'total', 'amount', 'date', 'time', 'page',
    'order', 'duplicate', 'customer', 'cashier', 'terminal', 'auth', 'thank',
    'welcome', 'please', 'visit', 'gst', 'vat', 'subtotal', 'visa', 'mastercard',
    'amex', 'rupee', 'payment', 'bill', 'cash', 'change', 'balance', 'paid',
    'transaction', 'ref', 'upi', 'neft', 'imps', 'ifsc', 'account', 'bank',
    'no.', 'number',
  ];

  const lines = text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 3 && l.length <= 60);

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (/^[\d\s₹$€£.,:\-/]+$/.test(line)) continue;
    if (/^[$₹€£¥]/.test(line)) continue;
    if (skipWords.some(kw => lower.includes(kw))) continue;
    if (/\b\d{6,}\b/.test(line)) continue; // phone/account numbers
    const cleaned = line.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z0-9\s&'.\-]+$/, '').trim();
    if (cleaned.length >= 3 && /[a-zA-Z]{2,}/.test(cleaned)) return cleaned;
  }

  const withLetters = lines
    .filter(l => /[a-zA-Z]{3,}/.test(l) && !/total|amount|date|tax/i.test(l))
    .sort((a, b) => b.length - a.length);
  return withLetters[0]?.trim() || '';
}

function parseExtractedText(rawText: string) {
  console.log('[UPLOAD] Raw text preview:', rawText.substring(0, 500).replace(/\n/g, ' | '));
  const amount   = extractAmount(rawText);
  const date     = extractDate(rawText);
  const merchant = extractMerchant(rawText);
  console.log('[UPLOAD] Parsed → amount:', amount, '| date:', date, '| merchant:', merchant);
  return { amount, date, merchant, description: merchant };
}

// ─── CSV / tabular text parser ────────────────────────────────────────────────
// Handles CSV, TSV, and tabular text extracted from PDFs.
// Per-row try/catch — never crashes on bad rows, logs failures.

export interface ParsedTransaction {
  amount:      number;
  date:        string;
  description: string;
}

function parseCSVTransactions(text: string): ParsedTransaction[] {
  try {
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    // Detect delimiter: tab > pipe > semicolon > comma
    const sample = lines[0];
    const delim = sample.includes('\t') ? '\t'
      : sample.includes('|') ? '|'
      : sample.includes(';') ? ';'
      : ',';

    // Safe CSV line splitter — handles quoted fields with embedded delimiters
    const splitLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          // Handle escaped quotes ""
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === delim && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim());

    // Dynamic column detection — broad keyword matching for Indian bank formats
    const colIdx = (candidates: string[]): number =>
      candidates.reduce<number>(
        (found, c) => found !== -1 ? found : headers.findIndex(h => h.includes(c)),
        -1
      );

    const dateCol = colIdx([
      'date', 'txn date', 'transaction date', 'value date', 'posted',
      'booking date', 'trans date', 'dt',
    ]);
    const amtCol = colIdx([
      'amount', 'debit', 'withdrawal', 'credit', 'sum', 'inr', 'usd',
      'dr', 'cr', 'debit amount', 'credit amount', 'transaction amount',
    ]);
    const descCol = colIdx([
      'description', 'narration', 'particulars', 'details', 'merchant',
      'payee', 'memo', 'remarks', 'transaction details', 'transaction narration',
    ]);

    // If no header row found, try heuristic: look for a line that has date-like + number-like columns
    if (dateCol === -1 || amtCol === -1) {
      console.log('[BANK/CSV] No standard headers found. Headers detected:', headers.join(' | '));
      // Try positional parsing: assume col 0 = date, last numeric col = amount, middle = description
      return parsePositional(lines, splitLine);
    }

    const transactions: ParsedTransaction[] = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = splitLine(lines[i]);
        const maxNeeded = Math.max(dateCol, amtCol);
        if (cols.length <= maxNeeded) {
          skipped++;
          continue;
        }

        const rawDate   = cols[dateCol]?.trim() ?? '';
        const rawAmount = cols[amtCol]?.trim()  ?? '';
        const rawDesc   = descCol !== -1 ? (cols[descCol]?.trim() ?? '') : '';

        // Skip header-like rows that sneak in mid-file
        if (/^(date|amount|description|narration|particulars)/i.test(rawDate)) continue;
        // Skip empty rows
        if (!rawDate && !rawAmount) continue;

        const date   = extractDate(rawDate || lines[i]);
        // Strip currency symbols and commas before parsing
        const amount = parseFloat(rawAmount.replace(/[₹$€£,\s]/g, '').replace(/[^0-9.]/g, ''));

        if (!amount || isNaN(amount) || amount <= 0) {
          console.log(`[BANK/CSV] Row ${i}: skipped — invalid amount "${rawAmount}"`);
          skipped++;
          continue;
        }

        const description = rawDesc || extractMerchant(lines[i]);

        transactions.push({ amount, date, description });
      } catch (rowErr: any) {
        console.log(`[BANK/CSV] Row ${i}: parse error — ${rowErr?.message ?? rowErr}`);
        skipped++;
      }
    }

    if (skipped > 0) {
      console.log(`[BANK/CSV] Skipped ${skipped} invalid rows, extracted ${transactions.length} valid transactions`);
    }

    return transactions;
  } catch (err: any) {
    console.error('[BANK/CSV] Fatal parse error:', err?.message ?? err);
    return [];
  }
}

// Positional fallback: no headers — try to infer columns by content type
function parsePositional(lines: string[], splitLine: (l: string) => string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const cols = splitLine(lines[i]);
      if (cols.length < 2) continue;

      // Find the first column that looks like a date
      let dateStr = '';
      let dateColIdx = -1;
      for (let c = 0; c < cols.length; c++) {
        const d = extractDate(cols[c]);
        if (d !== new Date().toISOString().split('T')[0]) { // not today = found a real date
          dateStr = d;
          dateColIdx = c;
          break;
        }
      }
      if (!dateStr) continue;

      // Find the last column that looks like a number
      let amount = 0;
      for (let c = cols.length - 1; c >= 0; c--) {
        if (c === dateColIdx) continue;
        const v = parseFloat(cols[c].replace(/[₹$€£,\s]/g, '').replace(/[^0-9.]/g, ''));
        if (!isNaN(v) && v > 0 && v < 10_000_000) { amount = v; break; }
      }
      if (!amount) continue;

      // Description: everything that's not date or amount
      const desc = cols
        .filter((_, c) => c !== dateColIdx)
        .filter(c => {
          const v = parseFloat(c.replace(/[₹$€£,\s]/g, '').replace(/[^0-9.]/g, ''));
          return isNaN(v) || v !== amount;
        })
        .join(' ')
        .trim();

      transactions.push({ amount, date: dateStr, description: desc || 'Bank transaction' });
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
      return NextResponse.json({ ok: false, error: 'The file is empty. Please upload a valid file.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'File too large (max 10 MB).' }, { status: 413 });
    }

    // Validate filename has a recognisable extension
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ext || ext === file.name.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'File has no extension. Please upload a PDF, image, or CSV.' }, { status: 400 });
    }
    const mimeType = file.type.toLowerCase();
    const isImage = IMAGE_TYPES.has(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const isPDF = mimeType === PDF_TYPE || ext === '.pdf';
    const isText = TEXT_TYPES.has(mimeType) || ['.csv', '.txt'].includes(ext);

    if (!isImage && !isPDF && !isText) {
      return NextResponse.json({ ok: false, error: 'Unsupported file type.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText = '';

    // ── IMAGE (Tesseract.js v7 + sharp preprocessing) ──────────────────────
    if (isImage) {
      try {
        const sharp = require('sharp');
        // Gentle pass: grayscale + normalize + mild sharpen (no threshold)
        // Threshold destroys low-contrast thermal receipts
        const processedBuffer = await sharp(buffer)
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
        const { data: { text, confidence } } = await worker.recognize(processedBuffer);
        rawText = text;

        // Low confidence → retry with binarized version
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
        console.error('[UPLOAD/TESSERACT] Failed:', err);
        return NextResponse.json({ ok: false, error: 'Failed to process image via OCR.' }, { status: 422 });
      }
    }

    // ── PDF — pdf-parse (pure Node, zero worker dependencies) ──────────────
    else if (isPDF) {
      try {
        // Require the internal lib directly to avoid pdf-parse running its
        // own test suite (which tries to open test/data/05-versions-space.pdf)
        const pdfParse = require('pdf-parse/lib/pdf-parse.js');
        const result   = await pdfParse(buffer);
        rawText = result.text ?? '';
      } catch (err: any) {
        console.error('[UPLOAD/PDF-PARSE] Failed:', err);
        return NextResponse.json({ ok: false, error: 'Failed to parse PDF document.' }, { status: 422 });
      }
    }

    // ── TEXT / CSV ──────────────────────────────────────────────────────────
    else if (isText) {
      rawText = buffer.toString('utf8');
    }

    if (!rawText || rawText.trim().length < 5) {
      // Image-based / scanned PDFs have no text layer — return empty extracted
      // data so the UI can prompt the user to fill fields manually
      if (isPDF) {
        return NextResponse.json({
          ok: true,
          data: {
            extracted: { amount: 0, date: new Date().toISOString().split('T')[0], merchant: '', description: '' },
            source: 'bank',
            amountWarning: 'This PDF appears to be a scanned image with no text layer. Please enter the details manually.',
          }
        });
      }
      return NextResponse.json({ ok: false, error: 'File appears to be empty or unreadable.' }, { status: 422 });
    }

    const data = parseExtractedText(rawText);

    // For CSV/text files, attempt multi-transaction parsing first
    if (isText) {
      try {
        const transactions = parseCSVTransactions(rawText);
        if (transactions.length > 0) {
          console.log(`[BANK/CSV] Returning ${transactions.length} transactions`);
          return NextResponse.json({ ok: true, data: { transactions, source: 'bank' } });
        }
      } catch (csvErr: any) {
        console.error('[BANK/CSV] parseCSVTransactions threw:', csvErr?.message);
        // Fall through to single-transaction extraction
      }
    }

    // For PDF bank statements, also try multi-transaction parsing on extracted text
    if (isPDF) {
      try {
        const transactions = parseCSVTransactions(rawText);
        if (transactions.length > 1) {
          console.log(`[BANK/PDF] Returning ${transactions.length} transactions from PDF`);
          return NextResponse.json({ ok: true, data: { transactions, source: 'bank' } });
        }
      } catch (pdfTxErr: any) {
        console.error('[BANK/PDF] Multi-transaction parse failed:', pdfTxErr?.message);
        // Fall through to single-transaction extraction
      }
    }

    // Warn if no amount could be extracted — UI should prompt user to fill it in
    const amountWarning = data.amount === 0
      ? 'Could not detect an amount. Please enter it manually.'
      : null;

    return NextResponse.json({
      ok: true,
      data: { extracted: data, source: isImage ? 'ocr' : 'bank', amountWarning }
    });

  } catch (err: any) {
    console.error('[UPLOAD] Error:', err);
    return NextResponse.json({ ok: false, error: 'An unexpected processing error occurred.' }, { status: 500 });
  }
}

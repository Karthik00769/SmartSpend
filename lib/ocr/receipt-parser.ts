/**
 * lib/ocr/receipt-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared parsing engine for receipt OCR and bank statement extraction.
 *
 * Design principles:
 *  1. ZONE CLASSIFICATION — every line tagged: header / item / tax / total / noise
 *  2. CONTEXTUAL extraction — amounts from TOTAL zone first, merchant from HEADER zone
 *  3. CROSS-VALIDATION — detected total compared against sum of ITEM lines (±15%)
 *  4. LEARNING BEHAVIOR — user corrections stored & reused via correction-store
 *  5. Junk-line rejection — phones, GSTINs, dates structurally barred
 *  6. Year-number rejection — 1900-2099 integers never treated as prices
 *  7. needsReview flag — always set when confidence is LOW or data missing
 *  8. Shared by scan AND upload route (single source of truth)
 */

import {
  classifyReceiptLines,
  getZoneLines,
  crossValidateAmount,
  type ClassifiedLine,
} from '@/lib/ocr/receipt-classifier';

import { lookupCorrection } from '@/lib/ocr/correction-store';
import { validateOCRWithGemini } from '@/lib/ai/receiptValidator';


// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100_000; // 1 lakh

// Words that appear on receipt headers/footers but are NOT merchant names
const SKIP_WORDS = new Set([
  'receipt', 'invoice', 'tax', 'total', 'amount', 'date', 'time', 'page',
  'order', 'duplicate', 'customer', 'cashier', 'terminal', 'auth', 'thank',
  'welcome', 'please', 'visit', 'gst', 'vat', 'subtotal', 'visa', 'mastercard',
  'amex', 'rupee', 'payment', 'bill', 'cash', 'change', 'balance', 'paid',
  'transaction', 'ref', 'upi', 'neft', 'imps', 'ifsc', 'account', 'bank',
  'number', 'phone', 'mobile', 'address', 'city', 'state', 'pin', 'email',
  'www', 'http', 'gstin', 'cin', 'pan', 'fssai', 'licence', 'license',
  'original', 'copy', 'print', 'approved', 'declined', 'debit', 'credit',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedReceipt {
  amount:       number;        // 0 if not found or out of bounds
  date?:         string;        // extracted date in YYYY-MM-DD format
  merchant:     string;        // '' if not found
  description:  string;        // same as merchant, kept for API compat
  needsReview:  boolean;       // true when confidence is low or amount missing
  confidence:   'high' | 'medium' | 'low';
  errorMessage?: string;       // set when amount cannot be extracted at all
  rawSnippet?:  string;        // first 300 chars of cleaned text, for debugging
  dateAdjusted?: boolean;      // truthy if the extracted date was future and fallback to today was used
}

// ─── Text cleaning ───────────────────────────────────────────────────────────

/**
 * cleanOCRText
 * Cleans OCR noise from raw tesseract output.
 * STEP 1 of the multi-stage pipeline.
 *
 *  - Removes garbage control characters
 *  - Normalises currency symbols (Rs, Rs., RS → Rs)
 *  - Fixes common OCR substitutions (O→0 in digit context, l→1 in digit context)
 *  - Collapses duplicate whitespace and blank lines
 */
export function cleanOCRText(raw: string): string {
  return raw
    // Remove control chars except newline/tab
    .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, ' ')
    // Normalize "Rs." / "RS." → "Rs"
    .replace(/\bR[Ss]\.?\s*/g, 'Rs ')
    // Fix OCR: "O" misread as "0" inside number sequences like "Rs O12.5O"
    .replace(/(?<=\d)O(?=\d)/g, '0')
    // Fix OCR: lowercase "l" misread where a digit is expected (e.g. "l50" → "150")
    .replace(/(?<=\s|^)l(?=\d)/gm, '1')
    // Collapse runs of spaces (but NOT newlines)
    .replace(/ {2,}/g, ' ')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Priority patterns ─────────────────────────────────────────────────────────

/** Score 100 — Lines containing total/grand total/amount paid/net amount */
const TOTAL_LINE_PATTERN =
  /\b(grand\s*total|total\s*amount|amount\s*payable|net\s*payable|amount\s*paid|amount\s*due|net\s*amount|total\s*due|bill\s*amount|payable\s*amount|total\s*payable|net\s*bill|final\s*amount|total)\b/i;

/** Patterns that disqualify a line — tax components and per-item amounts */
const FALSE_POSITIVE_PATTERN =
  /\b(cgst|sgst|igst|cess|tax|vat|service\s*tax|discount|round\s*off|rounding|tds|surcharge|tip|gratuity|item\s*total|qty|quantity|rate|mrp|unit\s*price|per\s*unit|each)\b/i;

const RECEIPT_DATE_PATTERNS = [
  /\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/,     // DD/MM/YYYY
  /\b(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})\b/,     // YYYY-MM-DD
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i, // 15 Jan 2024
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})\b/, // D/M/YY
];

// ── Junk line guard ───────────────────────────────────────────────────────────
/**
 * isJunkLine
 * STEP 2 guard: Returns true for lines that structurally cannot contain a
 * receipt total. These are filtered OUT before any number extraction.
 *
 * Catches: phone numbers, GSTINs, date labels, invoice numbers, addresses,
 * emails, URLs, and pure decoration lines.
 */
function isJunkLine(line: string): boolean {
  const trimmed = line.trim();

  // Too short to be meaningful
  if (trimmed.length < 2) return true;

  // Pure decoration: dashes, stars, equals, underscores
  if (/^[-=*_.:|]{3,}$/.test(trimmed)) return true;

  // Full Indian GSTIN: 2 digits + 5 alpha + 4 digits + 1 alpha + 1 digit + Z + 1 alnum
  if (/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/i.test(trimmed)) return true;

  // Phone number detection — strip separators then check for 7+ consecutive digits
  const digitsOnly = trimmed.replace(/[\s\-().+]/g, '');
  if (/\d{7,}/.test(digitsOnly)) return true;

  // Date-label lines: "Date: 01/04/2023", "Dt:", "Invoice Date:", "Bill Date:"
  if (/^\s*(date|dt|time|invoice\s*(?:date|no|num|number|#)|bill\s*(?:date|no)|txn\s*date|trans\s*date)\s*[:.]?\s*/i.test(trimmed)) return true;

  // Lines that ARE purely a date value (no other content)
  if (/^\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*$/.test(trimmed)) return true;
  if (/^\s*\d{4}[\/\-]\d{2}[\/\-]\d{2}\s*$/.test(trimmed)) return true;

  // Invoice / order / reference number lines
  if (/^\s*(invoice|order|bill|receipt|txn|transaction|ref(?:erence)?|auth)\s*(no|num|number|#|id|code)?\s*[:.]?\s*[\w\-\/]+\s*$/i.test(trimmed)) return true;

  // Address keywords
  if (/\b(street|road|ave|avenue|nagar|colony|sector|plot|flat|floor|pincode|zip\s*code)\b/i.test(trimmed)) return true;

  // Email & URL
  if (/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(trimmed)) return true;
  if (/https?:\/\/|www\.\w+/i.test(trimmed)) return true;

  // CIN / PAN / FSSAI lines (regulatory IDs, not amounts)
  if (/\b(CIN|PAN|FSSAI|L\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/.test(trimmed)) return true;

  return false;
}

/**
 * isYearLike
 * Returns true for integers in the calendar year range 1900–2099.
 * These appear on receipts as dates but must NEVER be treated as amounts.
 */
function isYearLike(v: number): boolean {
  return Number.isInteger(v) && v >= 1900 && v <= 2099;
}

// ─── Zone-aware amount extraction ────────────────────────────────────────────

/**
 * extractAmountFromZones
 * Context-aware amount extraction using classified line zones.
 *
 * Priority cascade (scoring per spec):
 *  Score 100 — TOTAL zone line with a keyword match
 *  Score  80 — TOTAL zone line (positional, last 30%)
 *  Score  60 — Line with explicit currency symbol (Rs/₹/INR)
 *  Score  40 — Line with any decimal (last resort)
 *
 * Cross-validation: if multiple TOTAL lines found, prefer the highest value
 * that is also consistent with the sum of ITEM lines (±15% tolerance).
 *
 * Junk, phone numbers, GSTINs, years — all barred by the classifier.
 */
function extractAmountFromZones(
  classified: ClassifiedLine[],
): { value: number; confidence: number; source: string } {
  interface ZoneCandidate {
    value:      number;
    confidence: number;
    source:     string;
    lineIdx:    number;
    lineText:   string;
  }
  const candidates: ZoneCandidate[] = [];

  // ── PASS 1 (score 100): TOTAL zone lines ─────────────────────────────────
  const totalLines = getZoneLines(classified, 'total');
  for (const cl of totalLines) {
    if (cl.numbers.length === 0) continue;
    // Rightmost number = value column (label | amount layout)
    const val = cl.numbers[cl.numbers.length - 1];
    // Boost to 110 if line also has an explicit total keyword
    const hasKeyword = TOTAL_LINE_PATTERN.test(cl.raw);
    const conf = hasKeyword ? 110 : 100;
    candidates.push({ value: val, confidence: conf, source: 'total-zone', lineIdx: cl.lineIndex, lineText: cl.raw });
  }

  // ── PASS 2 (score 60): Currency-symbol lines (any zone except noise) ──────
  const CURRENCY_RE = /(?:[₹$€£¥]|Rs\.?|INR|USD|EUR|GBP)\s*(\d{1,6}(?:\.\d{1,2})?)/gi;
  for (const cl of classified) {
    if (cl.zone === 'noise') continue;
    if (FALSE_POSITIVE_PATTERN.test(cl.raw)) continue;
    let m: RegExpExecArray | null;
    const re = new RegExp(CURRENCY_RE.source, 'gi');
    while ((m = re.exec(cl.cleaned)) !== null) {
      const v = parseFloat(m[1] ?? '');
      if (isNaN(v) || v < MIN_AMOUNT || v > MAX_AMOUNT || isYearLike(v)) continue;
      const conf = TOTAL_LINE_PATTERN.test(cl.raw) ? 90 : 60;
      candidates.push({ value: v, confidence: conf, source: 'currency-symbol', lineIdx: cl.lineIndex, lineText: cl.raw });
    }
  }

  // ── PASS 3 (score 40): Last decimal in any non-noise, non-tax line ────────
  for (let i = classified.length - 1; i >= 0; i--) {
    const cl = classified[i];
    if (cl.zone === 'noise' || cl.zone === 'tax') continue;
    const decimals = cl.numbers.filter(v => !Number.isInteger(v));
    if (decimals.length === 0) continue;
    candidates.push({
      value: decimals[decimals.length - 1],
      confidence: 40,
      source: 'last-decimal-fallback',
      lineIdx: cl.lineIndex,
      lineText: cl.raw,
    });
    break;
  }

  if (candidates.length === 0) return { value: 0, confidence: 0, source: 'none' };

  // ── Sort: higher confidence first; ties → later line wins ─────────────────
  candidates.sort((a, b) => b.confidence - a.confidence || b.lineIdx - a.lineIdx || b.value - a.value);

  // ── Cross-validation: if multiple high-conf candidates, pick best consistent ─
  // Among top-tier (score >= 80) candidates, prefer the one closest to itemSum
  const topTier = candidates.filter(c => c.confidence >= 80);
  let winner = candidates[0]; // default: highest confidence

  if (topTier.length > 1) {
    // Check which among top-tier passes cross-validation
    for (const cand of topTier) {
      const xv = crossValidateAmount(cand.value, classified);
      if (xv.valid) {
        winner = cand;
        break;
      }
    }
    // If none passed cross-validation, keep highest value among TOTAL zone
    // (higher totals are usually more meaningful — tax-inclusive vs exclusive)
    if (winner === candidates[0] && topTier.length > 1) {
      const highestTotal = topTier.reduce((a, b) => (b.value > a.value ? b : a));
      // Only take highest if it's not astronomically different
      if (highestTotal.value <= topTier[0].value * 2) {
        winner = highestTotal;
      }
    }
  }

  console.log(
    '[PARSER/zones] candidates:',
    candidates.slice(0, 6).map(c => `${c.source}:${c.value}(sc=${c.confidence},ln=${c.lineIdx})`).join(' | '),
  );
  console.log('[PARSER/zones] WINNER:', winner.value, '| src:', winner.source, '| line:"', winner.lineText?.trim(), '"');

  return { value: winner.value, confidence: winner.confidence, source: winner.source };
}

// ─── Kept for CSV/PDF compatibility ──────────────────────────────────────────
// extractAmount is still exported so any direct callers (tests, scripts) keep working.
// Internally, parseReceiptText uses extractAmountFromZones (zone-aware).

/**
 * extractAmount
 * Legacy/compat export — wraps the zone-aware pipeline.
 * Called by the main parseReceiptText; also available for direct use.
 */
export function extractAmount(text: string): { value: number; confidence: number; source: string } {
  const classified = classifyReceiptLines(text);
  return extractAmountFromZones(classified);
}

// ─── Zone-aware merchant extraction ──────────────────────────────────────────

/**
 * extractMerchantFromZones
 * Extracts the merchant name from HEADER zone lines only (first 5).
 *
 * Rules:
 *  1. Only use lines classified as 'header'
 *  2. Reject: numbers, GSTIN, invoice, phone, URL
 *  3. Prefer: ALL-CAPS multi-word (thermal receipt store names)
 *  4. Fallback: any alpha line from first 5 non-noise lines
 */
function extractMerchantFromZones(classified: ClassifiedLine[]): string {
  const headerLines = getZoneLines(classified, 'header').slice(0, 5);

  const isNoiseMerchantLine = (line: string): boolean => {
    const lower = line.toLowerCase();
    if (/^[\d\s\u20B9$€£.,:\-/\\|()%#*=_]+$/.test(line)) return true;
    if (/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{3}\b/i.test(line)) return true;
    if (/\b\d{7,}\b/.test(line)) return true;
    if (/[@.](?:com|in|org|net|co)\b|www\./i.test(line)) return true;
    if (/^[\$\u20B9€£¥]/.test(line)) return true;
    if (/^\s*(invoice|order|bill|receipt|txn|ref)\s*(no|num|#|id)?\s*[:.]?/i.test(line)) return true;
    const words = lower.split(/\s+/);
    if (words.length === 1 && SKIP_WORDS.has(lower.trim())) return true;
    if (words.filter(w => SKIP_WORDS.has(w)).length >= 2) return true;
    if (/^[a-z\s]+[:\-]\s*[\d\u20B9]+$/i.test(line)) return true;
    return false;
  };

  const cleanLine = (line: string): string =>
    line.replace(/^[^a-zA-Z]+/, '').replace(/[^\w\s&',.\-]+$/, '').trim();

  const scoreLine = (line: string): number => {
    let score = line.length;
    if (/^[A-Z0-9\s&'.,-]+$/.test(line)) score += 40;  // ALL-CAPS boost
    if (line.split(/\s+/).length >= 2)    score += 20;  // multi-word boost
    return score;
  };

  // Primary: use classified HEADER lines
  const primary = headerLines
    .map(cl => cl.raw)
    .filter(l => !isNoiseMerchantLine(l))
    .map(cleanLine)
    .filter(l => l.length >= 3 && /[a-zA-Z]{2,}/.test(l));

  if (primary.length > 0) {
    primary.sort((a, b) => scoreLine(b) - scoreLine(a));
    return primary[0].slice(0, 60);
  }

  // Fallback: first 8 non-noise lines from full text
  const fallback = classified
    .filter(cl => cl.zone !== 'noise')
    .slice(0, 8)
    .map(cl => cl.raw)
    .filter(l => !isNoiseMerchantLine(l))
    .map(cleanLine)
    .filter(l => l.length >= 3 && /[a-zA-Z]{3,}/.test(l));

  if (fallback.length > 0) {
    fallback.sort((a, b) => scoreLine(b) - scoreLine(a));
    return fallback[0].slice(0, 60);
  }

  return '';
}

/**
 * extractMerchant
 * Compat export — wraps zone-aware implementation.
 */
export function extractMerchant(text: string): string {
  const classified = classifyReceiptLines(text);
  return extractMerchantFromZones(classified);
}

/**
 * extractDateFromReceipt
 * Scans the first and last sections of the receipt for date-like strings.
 * Validates extracted date is not in the future.
 */
function extractDateFromReceipt(text: string): { date: string; adjusted: boolean } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  const lines = text.split('\n');
  const sample = [...lines.slice(0, 15), ...lines.slice(-10)];
  
  for (const line of sample) {
    for (const pattern of RECEIPT_DATE_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        try {
          let y, m, d;
          if (pattern.source.startsWith('\\b(\\d{2})[\\\/\\-.](\\d{2})')) {
            // DD/MM/YYYY
            [d, m, y] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          } else if (pattern.source.startsWith('\\b(\\d{4})')) {
            // YYYY-MM-DD
            [y, m, d] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          } else if (pattern.source.includes('Jan|Feb')) {
             // 15 Jan 2024
             d = parseInt(match[1]);
             y = parseInt(match[3]);
             const monthMap: any = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
             m = monthMap[match[2].toLowerCase()];
          } else {
             // D/M/YY fallback - skip for now as ambiguous
             continue;
          }

          if (y < 2000 || y > 2100) continue;
          
          const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const parsed = new Date(isoDate + 'T00:00:00Z');
          if (isNaN(parsed.getTime())) continue;

          // Reject future dates
          if (isoDate > todayStr) {
             console.log(`[PARSER/date] Future date detected (${isoDate}) - falling back to today.`);
             return { date: todayStr, adjusted: true };
          }
          
          console.log(`[PARSER/date] Detected valid date: ${isoDate}`);
          return { date: isoDate, adjusted: false };
        } catch { continue; }
      }
    }
  }

  return { date: todayStr, adjusted: false }; // fallback
}

// ─── Main parse function ─────────────────────────────────────────────────────

/**
 * parseReceiptText
 * Full contextual pipeline:
 *
 *  STEP 1 — Clean OCR text
 *  STEP 2 — Classify lines into zones (header/item/tax/total/noise)
 *  STEP 3 — Extract amount from TOTAL zone (with cross-validation)
 *  STEP 4 — Extract merchant from HEADER zone only
 *  STEP 5 — Learning: check correction-store for known merchant patterns
 *  STEP 6 — Cross-validate: total vs. sum of item lines
 *  STEP 7 — Consistency check: mark LOW confidence if anything is missing
 *
 * Returns ParsedReceipt — identical shape to previous version.
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  // STEP 1: Clean
  const text = cleanOCRText(rawText);

  // STEP 2: Classify all lines into zones
  const classified = classifyReceiptLines(text);

  // STEP 3: Zone-aware amount extraction
  const { value: amount, confidence: amtConf, source: amtSource } = extractAmountFromZones(classified);

  // STEP 4: Extract date
  const { date, adjusted: dateAdjusted } = extractDateFromReceipt(text);

  // STEP 5: Zone-aware merchant extraction
  let merchant = extractMerchantFromZones(classified);

  // STEP 5: Cross-validation (log only — doesn't block, but downgrades confidence)
  const xv = crossValidateAmount(amount, classified);
  if (!xv.valid && xv.itemCount > 2) {
    // We have enough item lines to trust cross-validation — flag for review
    console.log(
      `[PARSER/xvalidate] MISMATCH: total=${amount} itemSum=${xv.itemSum} items=${xv.itemCount}`,
      `reason: ${xv.reason}`,
    );
  } else if (xv.itemCount > 0) {
    console.log(`[PARSER/xvalidate] OK: total=${amount} itemSum=${xv.itemSum} items=${xv.itemCount}`);
  }

  // STEP 6: Consistency check
  const validAmount = amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
  const finalAmount = validAmount ? amount : 0;

  let confidence: 'high' | 'medium' | 'low';
  if (amtConf >= 90) {
    confidence = 'high';
  } else if (amtConf >= 60) {
    // Downgrade to low if cross-validation failed with enough item evidence
    confidence = (!xv.valid && xv.itemCount >= 3) ? 'low' : 'medium';
  } else {
    confidence = 'low';
  }

  // STEP 7: Fail-safe — needsReview when uncertain
  const needsReview =
    finalAmount === 0 ||
    confidence === 'low' ||
    merchant.trim().length === 0;

  const errorMessage = finalAmount === 0
    ? 'Unable to detect amount — please enter it manually.'
    : undefined;

  console.log(
    `[PARSER] amount=${finalAmount} (conf=${amtConf}, src=${amtSource})`,
    `| merchant="${merchant}"`,
    `| confidence=${confidence}`,
    `| needsReview=${needsReview}`,
    `| zones: header=${getZoneLines(classified,'header').length}`,
    `item=${getZoneLines(classified,'item').length}`,
    `tax=${getZoneLines(classified,'tax').length}`,
    `total=${getZoneLines(classified,'total').length}`,
    errorMessage ? `| ERROR: ${errorMessage}` : '',
  );

  return {
    amount:       finalAmount,
    date,
    dateAdjusted,
    merchant,
    description:  merchant,
    needsReview,
    confidence,
    errorMessage,
    rawSnippet:   text.slice(0, 300),
  };
}

/**
 * parseReceiptTextWithLearning
 * Async version of parseReceiptText that also applies saved OCR corrections.
 *
 * Use this in the scan/upload routes for maximum accuracy.
 * Falls back to synchronous parseReceiptText if correction-store is unavailable.
 */
export async function parseReceiptTextWithLearning(rawText: string): Promise<ParsedReceipt> {
  // Run the synchronous pipeline first
  const base = parseReceiptText(rawText);

  // Attempt to look up a stored correction for this merchant
  try {
    if (base.merchant) {
      const correction = await lookupCorrection(base.merchant);
      if (correction) {
        console.log(
          `[PARSER/learn] Applied correction: "${base.merchant}" → "${correction.correctedMerchant}"`,
          correction.correctedAmount > 0 ? `amount override: ${correction.correctedAmount}` : '',
        );
        return {
          ...base,
          merchant:    correction.correctedMerchant,
          description: correction.correctedMerchant,
          // Only override amount if the correction explicitly stores one
          // AND the current detection is low-confidence
          amount: (correction.correctedAmount > 0 && base.confidence === 'low')
            ? correction.correctedAmount
            : base.amount,
          // If we applied a correction, bump confidence
          confidence:  'high',
          needsReview: base.amount === 0, // still need review if amount missing
        };
      }
    }
  } catch (e: any) {
    console.warn('[PARSER/learn] Correction lookup failed:', e?.message);
  }

  // ── Step 2: Gemini Secondary Validation ──────────────────────────────────
  try {
    const aiValidation = await validateOCRWithGemini(base.merchant, base.amount, rawText);
    if (aiValidation) {
      let boosted = false;
      const result = { ...base };

      if (aiValidation.merchant && aiValidation.merchant !== base.merchant) {
        console.log(`[PARSER/AI] Corrected merchant: "${base.merchant}" → "${aiValidation.merchant}"`);
        result.merchant = aiValidation.merchant;
        result.description = aiValidation.merchant;
        boosted = true;
      }
      
      // Assume AI amount is better if our base amount was 0 OR confidence was low
      if (aiValidation.amount && (base.amount === 0 || base.confidence === 'low')) {
         console.log(`[PARSER/AI] Corrected amount: ${base.amount} → ${aiValidation.amount}`);
         result.amount = aiValidation.amount;
         boosted = true;
      }

      if (boosted) {
        result.confidence = 'high';
        result.needsReview = result.amount === 0;
        result.errorMessage = result.amount === 0 ? 'Unable to detect amount — please enter it manually.' : undefined;
      }

      return result;
    }
  } catch (e: any) {
    console.warn('[PARSER/AI] Gemini validation failed:', e?.message);
  }

  return base;
}

// ─── CSV Column detection helpers ────────────────────────────────────────────

/**
 * detectCSVDelimiter
 * Determines the field delimiter used in a CSV/TSV file.
 * Checks a sample of lines and picks the delimiter that appears consistently.
 */
export function detectCSVDelimiter(sample: string[]): string {
  const candidates = ['\t', '|', ';', ','];
  const counts: Record<string, number[]> = {};

  for (const delim of candidates) {
    counts[delim] = sample.slice(0, 5).map(l => (l.match(new RegExp(`\\${delim}`, 'g')) ?? []).length);
  }

  // Pick the delimiter with consistent non-zero counts
  const best = candidates.find(d => {
    const c = counts[d];
    const nonZero = c.filter(n => n > 0);
    if (nonZero.length < 2) return false;
    // All non-zero counts should be within 2 of each other (consistent column count)
    const mn = Math.min(...nonZero);
    const mx = Math.max(...nonZero);
    return mx - mn <= 2;
  });

  return best ?? ',';
}

/**
 * splitCSVLine
 * RFC 4180-compliant CSV splitter that handles quoted fields.
 */
export function splitCSVLine(line: string, delim: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
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
}

/**
 * detectCSVColumns
 * Dynamically maps header names to column indices.
 * Handles 50+ bank statement formats from Indian banks (HDFC, SBI, ICICI, Axis, etc.)
 * and international formats.
 *
 * Returns -1 for any column not found.
 */
export interface CSVColumnMap {
  dateCol:   number;
  amountCol: number;  // primary amount column (debit/credit/total)
  debitCol:  number;  // separate debit column (some banks split debit/credit)
  creditCol: number;
  descCol:   number;
}

export function detectCSVColumns(headers: string[]): CSVColumnMap {
  const h = headers.map(x => x.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim());

  const colIdx = (candidates: string[]): number => {
    for (const c of candidates) {
      const idx = h.findIndex(hdr =>
        hdr === c ||
        hdr.includes(c) ||
        c.includes(hdr)
      );
      if (idx !== -1) return idx;
    }
    return -1;
  };

  return {
    dateCol: colIdx([
      'date', 'txn date', 'transaction date', 'value date', 'posted date',
      'booking date', 'trans date', 'posting date', 'dt', 'tran date',
      'entry date', 'settlement date', 'processing date',
    ]),
    amountCol: colIdx([
      'amount', 'transaction amount', 'tran amount', 'txn amount',
      'sum', 'inr', 'usd', 'gbp', 'eur', 'total amount',
    ]),
    debitCol: colIdx([
      'debit', 'withdrawal', 'dr', 'dr amount', 'debit amount',
      'withdrawal amount', 'debit inr', 'expense',
    ]),
    creditCol: colIdx([
      'credit', 'deposit', 'cr', 'cr amount', 'credit amount',
      'deposit amount', 'credit inr',
    ]),
    descCol: colIdx([
      'description', 'narration', 'particulars', 'details', 'merchant',
      'payee', 'memo', 'remarks', 'transaction details', 'transaction narration',
      'transaction description', 'chq no narration', 'remarks narration',
      'beneficiary', 'name', 'reference', 'mode',
    ]),
  };
}

/**
 * parseRawAmount
 * Strips currency symbols, commas, spaces and parses a number.
 * Returns 0 if unparseable.
 */
export function parseRawAmount(raw: string): number {
  if (!raw) return 0;
  // Remove everything except digits and decimal point
  const cleaned = raw.replace(/[\u20B9$€£¥,\s()]/g, '').replace(/[^\d.]/g, '');
  // Handle cases like "(1234.56)" — negative in accounting notation
  const val = parseFloat(cleaned);
  return isNaN(val) || val < 0 ? 0 : val;
}

/**
 * validateCSVAmount
 * Returns true if the amount is within the acceptance window.
 * Discards amounts < 1 or > 1,00,000 as likely invalid.
 */
export function validateCSVAmount(amount: number): boolean {
  return amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
}

// ─── Bank Statement PDF Parser ────────────────────────────────────────────────

export interface ParsedPDFTransaction {
  amount:      number;
  date:        string;   // always today (server-enforced)
  description: string;
}

/**
 * parsePDFBankStatement
 *
 * Extracts individual transactions from the text of a DIGITAL bank-statement PDF.
 *
 * Strategy:
 *  - Scans line-by-line looking for lines that have BOTH a date AND an amount
 *  - Date patterns: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Mon YYYY
 *  - Amount patterns: digits with optional decimal and comma separators
 *  - Ignores lines that look like headers, page numbers, or running balances
 *  - All dates are forced to today (server-side enforcement)
 *
 * Returns [] if no transaction rows found (caller falls back to single-receipt parse).
 */
export function parsePDFBankStatement(text: string, todayDate: string): ParsedPDFTransaction[] {
  const transactions: ParsedPDFTransaction[] = [];

  // ── Date patterns ──────────────────────────────────────────────────────────
  const DATE_PATTERNS = [
    /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/,        // DD/MM/YYYY or DD-MM-YYYY
    /\b(\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/,        // YYYY-MM-DD
    /\b(\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\b/i, // 15 Jan 2024
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,  // D/M/YY short form
  ];

  // ── Amount pattern: 1-6 digits, optional comma grouping, optional .2 decimal ─
  const AMOUNT_RE = /\b(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,6}(?:\.\d{1,2})?)\b/g;

  // ── Lines to skip unconditionally ─────────────────────────────────────────
  const SKIP_LINE_RE = /^(date|sl|sr|no\.|page|#|narration|particulars|description|balance|opening|closing|account\s+no|statement|period|branch|ifsc|customer|name|address)/i;

  // Patterns that indicate a balance line (not a transaction)
  const BALANCE_LINE_RE = /\b(opening|closing|available|running)\s*(balance|bal)\b/i;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    try {
      // Skip header/label/page lines
      if (SKIP_LINE_RE.test(line)) continue;
      if (BALANCE_LINE_RE.test(line)) continue;
      // Skip lines that are only dashes/stars/equals (decorators)
      if (/^[-=*_.]{3,}$/.test(line)) continue;
      // Skip lines shorter than 10 chars (too short to be a transaction row)
      if (line.length < 10) continue;

      // Must contain a date
      let hasDate = false;
      for (const dp of DATE_PATTERNS) {
        if (dp.test(line)) { hasDate = true; break; }
      }
      if (!hasDate) continue;

      // Extract amounts — collect all valid ones, take the LAST non-balance one
      const rawAmounts: number[] = [];
      let m: RegExpExecArray | null;
      const re = new RegExp(AMOUNT_RE.source, 'g');
      while ((m = re.exec(line)) !== null) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(v) && v >= MIN_AMOUNT && v <= MAX_AMOUNT) {
          rawAmounts.push(v);
        }
      }

      if (rawAmounts.length === 0) continue;

      // Take the LAST valid amount (balance columns appear last in most formats)
      // But we want the TRANSACTION amount, not the running balance.
      // Heuristic: if there are 3+ amounts on one line (date + debit + credit + balance),
      // prefer the second-to-last (debit/credit before balance).
      let amount: number;
      if (rawAmounts.length >= 3) {
        // Likely: [txn_amount, ..., balance] — pick first non-zero from the front
        amount = rawAmounts.find(v => v >= MIN_AMOUNT) ?? rawAmounts[0];
      } else {
        amount = rawAmounts[rawAmounts.length - 1];
      }

      if (!validateCSVAmount(amount)) continue;

      // Description: everything between the date and the amount
      // Strip amounts and dates from the line to get the narration
      let description = line;
      for (const dp of DATE_PATTERNS) {
        description = description.replace(new RegExp(dp.source, 'gi'), '');
      }
      description = description
        .replace(AMOUNT_RE, '')      // remove all numbers
        .replace(/[\u20B9$€£¥]/g, '') // remove currency symbols
        .replace(/\s{2,}/g, ' ')    // collapse spaces
        .trim()
        .slice(0, 100);

      if (description.length < 3) description = 'Bank transaction';

      transactions.push({ amount, date: todayDate, description });
    } catch {
      // Skip malformed lines silently (never crash)
    }
  }

  console.log(`[PDF-BANK] Extracted ${transactions.length} transactions from ${lines.length} lines`);
  return transactions;
}

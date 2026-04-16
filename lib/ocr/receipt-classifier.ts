/**
 * lib/ocr/receipt-classifier.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Line-by-line zone classifier for receipt OCR.
 *
 * Every line in a receipt belongs to exactly one structural zone:
 *   HEADER  — merchant name, address, phone, GST registration info
 *   ITEM    — individual line items (product + qty + price)
 *   TAX     — tax / charge rows (CGST, SGST, service charge, discount)
 *   TOTAL   — the final payable amount rows
 *   NOISE   — decorators, dates, invoice numbers, blank lines
 *
 * Used by receipt-parser.ts for step 1 of contextual understanding:
 *   1. Classify all lines into zones
 *   2. Extract amount ONLY from TOTAL zone first (highest confidence)
 *   3. Cross-validate against sum of ITEM zone prices
 *   4. Extract merchant ONLY from HEADER zone
 */

export type LineZone = 'header' | 'item' | 'tax' | 'total' | 'noise';

export interface ClassifiedLine {
  raw:       string;    // original line text
  cleaned:   string;   // stripped line (no thousand-sep commas)
  zone:      LineZone;
  lineIndex: number;
  numbers:   number[]; // all valid price-range numbers found in this line
}

// ─── Pattern Library ──────────────────────────────────────────────────────────

/** Keywords that guarantee TOTAL zone */
const TOTAL_KEYWORDS = /\b(grand\s*total|total\s*amount|amount\s*payable|net\s*payable|amount\s*paid|amount\s*due|net\s*amount|total\s*due|bill\s*amount|payable\s*amount|total\s*payable|net\s*bill|final\s*amount|subtotal|sub\s*total|total)\b/i;

/** Keywords that guarantee TAX zone */
const TAX_KEYWORDS = /\b(cgst|sgst|igst|cess|vat|service\s*tax|service\s*charge|surcharge|tds|cess|levy|duty|round\s*off|rounding|discount|cashback|offer|coupon|promo|tip|gratuity)\b/i;

/** Keywords that guarantee ITEM zone */
const ITEM_KEYWORDS = /\b(qty|quantity|rate|mrp|unit\s*price|per\s*unit|each|pcs|nos|kg|gm|ltr|ml|dozen|pack|box)\b/i;

/** NOISE patterns — structural junk that contributes no financial info */
const NOISE_PATTERNS = [
  /^[-=*_.:|]{3,}$/,                                                    // decoration
  /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/i,                       // GSTIN
  /^\s*(date|dt|time|invoice\s*(?:date|no|num|number|#)|bill\s*(?:date|no)|txn\s*date)\s*[:.]?\s*/i,
  /^\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*$/,                      // pure date value
  /^\s*\d{4}[\/\-]\d{2}[\/\-]\d{2}\s*$/,                             // ISO date
  /^\s*(invoice|order|bill|receipt|txn|ref(?:erence)?|auth)\s*(no|num|number|#|id|code)?\s*[:.]?\s*[\w\-\/]+\s*$/i,
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i,                                  // email
  /https?:\/\/|www\.\w+/i,                                             // URL
  /\b(CIN|PAN|FSSAI|L\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/,          // regulatory IDs
  /\b(street|road|avenue|nagar|colony|sector|plot|flat|floor|pincode|zip\s*code)\b/i, // address
] as RegExp[];

/** Lines that look like phone numbers after stripping separators */
function isPhoneLike(line: string): boolean {
  const compact = line.replace(/[\s\-().+]/g, '');
  return /^\d{7,}$/.test(compact) || /\b\d{10,}\b/.test(compact);
}

/** Minimum/maximum valid price amounts */
const MIN_PRICE = 0.01;
const MAX_PRICE = 100_000;

function isYearLike(v: number): boolean {
  return Number.isInteger(v) && v >= 1900 && v <= 2099;
}

/**
 * extractNumbers
 * Pulls all numbers from a line that could plausibly be prices.
 * Rejects years, large bare integers (phone fragments), and out-of-range values.
 */
function extractNumbers(line: string): number[] {
  // Strip thousand-separators first
  const clean = line.replace(/,/g, '');
  return [...clean.matchAll(/\b(\d{1,6}(?:\.\d{1,2})?)\b/g)]
    .map(m => parseFloat(m[1]))
    .filter(v =>
      !isNaN(v) &&
      v >= MIN_PRICE &&
      v <= MAX_PRICE &&
      !isYearLike(v) &&
      // Reject plain integers ≥ 10,000 (phone-number fragments)
      !(Number.isInteger(v) && v >= 10_000)
    );
}

// ─── Zone detection heuristics ────────────────────────────────────────────────

/**
 * Assign a receipt zone to a single line using rule cascade.
 * Rules are checked in priority order: NOISE → TOTAL → TAX → ITEM → HEADER/ITEM
 */
function detectZone(
  line:        string,
  lineIndex:   number,
  totalLines:  number,
): LineZone {
  const trimmed = line.trim();
  if (trimmed.length < 2) return 'noise';

  // ── NOISE first (structurally impossible to be financial) ─────────────────
  for (const pat of NOISE_PATTERNS) {
    if (pat.test(trimmed)) return 'noise';
  }
  if (isPhoneLike(trimmed)) return 'noise';

  // ── TOTAL zone (keyword match — highest priority financial zone) ───────────
  if (TOTAL_KEYWORDS.test(trimmed) && !TAX_KEYWORDS.test(trimmed)) return 'total';

  // ── TAX zone ──────────────────────────────────────────────────────────────
  if (TAX_KEYWORDS.test(trimmed)) return 'tax';

  // ── ITEM zone keyword match ────────────────────────────────────────────────
  if (ITEM_KEYWORDS.test(trimmed)) return 'item';

  // ── Position-based heuristics ─────────────────────────────────────────────
  const relativePos = lineIndex / Math.max(1, totalLines);

  // First 20% → HEADER (merchant + address block)
  if (relativePos < 0.20) return 'header';

  // Last 30% → TOTAL zone if it has a number, otherwise noise
  if (relativePos >= 0.70) {
    const nums = extractNumbers(trimmed);
    return nums.length > 0 ? 'total' : 'noise';
  }

  // Middle 50% → ITEM zone if it has ≥ 1 number, else HEADER/NOISE
  const nums = extractNumbers(trimmed);
  if (nums.length >= 1) return 'item';

  // Pure-text line in body → carry forward as header context
  if (/[a-zA-Z]{3,}/.test(trimmed)) return 'header';

  return 'noise';
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * classifyReceiptLines
 * Classifies every non-empty line of receipt text into a structural zone.
 *
 * Returns an array of ClassifiedLine objects in document order.
 * The caller uses this to:
 *   - Extract totals ONLY from 'total' zone lines
 *   - Extract merchant ONLY from 'header' zone lines (first 5)
 *   - Cross-validate: sum of 'item' prices ≈ total
 */
export function classifyReceiptLines(text: string): ClassifiedLine[] {
  const rawLines = text.split('\n');
  const totalLines = rawLines.filter(l => l.trim().length > 0).length;

  let visibleIdx = 0; // tracks position among non-empty lines for relative position calc
  const result: ClassifiedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw     = rawLines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const cleaned = trimmed.replace(/,/g, ''); // strip thousand-separators
    const zone    = detectZone(trimmed, visibleIdx, totalLines);
    const numbers = extractNumbers(trimmed);

    result.push({ raw, cleaned, zone, lineIndex: visibleIdx, numbers });
    visibleIdx++;
  }

  return result;
}

/**
 * getZoneLines
 * Convenience helper: filter classified lines by zone.
 */
export function getZoneLines(lines: ClassifiedLine[], zone: LineZone): ClassifiedLine[] {
  return lines.filter(l => l.zone === zone);
}

/**
 * crossValidateAmount
 * Cross-validation: compare detected total against sum of item lines.
 *
 * Returns:
 *   { valid: true,  reason }  — total is consistent with items
 *   { valid: false, reason }  — total seems inconsistent (flag for review)
 *
 * Tolerance: ±15% of sum-of-items (accounts for rounding, fees)
 */
export interface ValidationResult {
  valid:        boolean;
  reason:       string;
  itemSum:      number;
  itemCount:    number;
}

export function crossValidateAmount(
  detectedTotal: number,
  classified:    ClassifiedLine[],
): ValidationResult {
  const itemLines = getZoneLines(classified, 'item');

  // If no item lines found, cross-validation is not possible — not a failure
  if (itemLines.length === 0) {
    return {
      valid:     true,
      reason:    'no-item-lines',
      itemSum:   0,
      itemCount: 0,
    };
  }

  // For each item line, take the LAST number (rightmost = price column)
  const itemPrices = itemLines
    .map(l => l.numbers)
    .filter(nums => nums.length > 0)
    .map(nums => nums[nums.length - 1]);

  if (itemPrices.length === 0) {
    return {
      valid:     true,
      reason:    'no-item-prices',
      itemSum:   0,
      itemCount: 0,
    };
  }

  const itemSum = itemPrices.reduce((a, b) => a + b, 0);

  // Allow ±15% tolerance for tax-inclusive totals etc.
  const tolerance = 0.15;
  const lower = itemSum * (1 - tolerance);
  const upper = itemSum * (1 + tolerance);

  const withinTolerance = detectedTotal >= lower && detectedTotal <= upper;

  // Also accept if total > itemSum (taxes pushed total up) but not > 2x
  const totalGTsum = detectedTotal > itemSum && detectedTotal <= itemSum * 2;

  const valid = withinTolerance || totalGTsum;

  return {
    valid,
    reason:    valid ? 'within-tolerance' : `total=${detectedTotal} itemSum=${itemSum.toFixed(2)}`,
    itemSum:   Math.round(itemSum * 100) / 100,
    itemCount: itemPrices.length,
  };
}

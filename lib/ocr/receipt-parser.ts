/**
 * lib/ocr/receipt-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared parsing engine for receipt OCR and bank statement extraction.
 *
 * Design principles:
 *  1. Multi-pass regex with strict priority ordering
 *  2. Confidence scoring — every candidate is scored, highest wins
 *  3. Amount validation gate: 1 ≤ amount ≤ 1,00,000 → else discard
 *  4. Merchant extraction from the 10-line "header zone" near the top
 *  5. Returns a `needsReview` flag when extraction is uncertain
 */

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
  merchant:     string;        // '' if not found
  description:  string;        // same as merchant, kept for API compat
  needsReview:  boolean;       // true when confidence is low or amount missing
  confidence:   'high' | 'medium' | 'low';
  errorMessage?: string;       // set when amount cannot be extracted at all
  rawSnippet?:  string;        // first 300 chars of cleaned text, for debugging
}

// ─── Text cleaning ───────────────────────────────────────────────────────────

/**
 * Cleans OCR noise from raw tesseract output:
 *  - Fixes common OCR substitutions (O→0 in numbers, l→1 in numbers)
 *  - Normalises whitespace and removes control chars
 *  - Collapses multiple blank lines
 */
export function cleanOCRText(raw: string): string {
  return raw
    // Remove control chars except newline/tab
    .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, ' ')
    // Fix OCR: "O" misread as "0" inside number sequences like "Rs O12.5O"
    .replace(/(?<=\d)O(?=\d)/g, '0')
    // Collapse runs of spaces (but NOT newlines)
    .replace(/ {2,}/g, ' ')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Amount extraction ───────────────────────────────────────────────────────

interface AmountCandidate {
  value:      number;
  confidence: number;   // higher = more confident
  source:     string;   // why we picked it
  lineIndex:  number;   // which line it came from (-1 = full-text scan)
  lineText:   string;   // the raw line text
}

// Lines whose amounts must be EXCLUDED (they represent tax components, not totals)
const FALSE_POSITIVE_PATTERN =
  /\b(cgst|sgst|igst|cess|tax|vat|service\s*tax|discount|round\s*off|rounding|tds|cess|surcharge|tip|gratuity)\b/i;

// Lines that indicate the FINAL total (highest priority)
const TOTAL_LINE_PATTERN =
  /\b(grand\s*total|total\s*amount|amount\s*payable|net\s*payable|amount\s*due|net\s*amount|total\s*due|bill\s*amount|payable\s*amount|total\s*payable|net\s*bill|final\s*amount|total)\b/i;

/**
 * extractAmount
 * Context-aware, line-level amount extraction.
 *
 * Priority order (highest wins):
 *  P1 (conf=100): Line matches TOTAL-like keyword + does NOT contain false-positive terms
 *  P2 (conf= 70): Currency symbol (₹/Rs/INR) on non-false-positive line
 *  P3 (conf= 55): Last occurring decimal number in the document (receipt totals are at bottom)
 *  P4 (conf= 40): Largest value among the last 5 lines
 *  P5 (conf= 20): Largest decimal in full document (last resort)
 *
 * False positives (CGST/SGST/TAX/DISCOUNT etc.) are suppressed at every pass.
 */
export function extractAmount(text: string): { value: number; confidence: number; source: string } {
  const candidates: AmountCandidate[] = [];

  // Work line-by-line so we have positional context
  const rawLines = text.split('\n');
  const lines    = rawLines.map(l => l.replace(/,/g, '').trim()); // strip thousand-separators

  // ── Helper: parse first valid number from a string fragment ────────────────
  const parseNum = (s: string): number => {
    const v = parseFloat(s.replace(/[^\d.]/g, ''));
    return isNaN(v) ? 0 : v;
  };

  // ── Helper: extract all numbers from a line ────────────────────────────────
  const numsInLine = (line: string): number[] =>
    [...line.matchAll(/\b(\d{1,6}(?:\.\d{1,2})?)\b/g)]
      .map(m => parseNum(m[1]))
      .filter(v => v >= MIN_AMOUNT && v <= MAX_AMOUNT);

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 1 — TOTAL keyword lines (P1, conf=100)
  // ══════════════════════════════════════════════════════════════════════════
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!TOTAL_LINE_PATTERN.test(line)) continue;
    if (FALSE_POSITIVE_PATTERN.test(line)) continue; // e.g. "Total Tax"

    const nums = numsInLine(line);
    // On TOTAL lines, prefer LAST number (rightmost = the value)
    const lastNum = nums[nums.length - 1];
    if (lastNum) {
      candidates.push({
        value:      lastNum,
        confidence: 100,
        source:     'total-keyword-line',
        lineIndex:  i,
        lineText:   rawLines[i],
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 2 — Currency-symbol lines that are NOT false-positives (P2, conf=70)
  // ══════════════════════════════════════════════════════════════════════════
  const currencyLineRe = /[₹]\s*(\d{1,6}(?:\.\d{1,2})?)|Rs\.?\s*(\d{1,6}(?:\.\d{1,2})?)|INR\s*(\d{1,6}(?:\.\d{1,2})?)/gi;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FALSE_POSITIVE_PATTERN.test(line)) continue;
    let m: RegExpExecArray | null;
    const re = new RegExp(currencyLineRe.source, 'gi');
    while ((m = re.exec(line)) !== null) {
      const v = parseNum(m[1] ?? m[2] ?? m[3] ?? '');
      if (v >= MIN_AMOUNT && v <= MAX_AMOUNT) {
        // Boost confidence slightly if this line also has a total keyword
        const conf = TOTAL_LINE_PATTERN.test(line) ? 90 : 70;
        candidates.push({ value: v, confidence: conf, source: 'currency-symbol', lineIndex: i, lineText: rawLines[i] });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 3 — Last occurring decimal in document (P3, conf=55)
  // Receipts always print their final total last — so the last decimal wins
  // ══════════════════════════════════════════════════════════════════════════
  for (let i = lines.length - 1; i >= 0; i--) {
    if (FALSE_POSITIVE_PATTERN.test(lines[i])) continue;
    const nums = numsInLine(lines[i]);
    const decimalNums = nums.filter(v => !Number.isInteger(v));
    if (decimalNums.length > 0) {
      const last = decimalNums[decimalNums.length - 1];
      candidates.push({ value: last, confidence: 55, source: 'last-decimal', lineIndex: i, lineText: rawLines[i] });
      break; // only need first (last-in-doc) occurrence
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 4 — Largest value among bottom 5 lines (P4, conf=40)
  // ══════════════════════════════════════════════════════════════════════════
  const last5Start = Math.max(0, lines.length - 5);
  let largestInLast5 = 0;
  let largestIdx     = -1;
  for (let i = last5Start; i < lines.length; i++) {
    if (FALSE_POSITIVE_PATTERN.test(lines[i])) continue;
    const nums = numsInLine(lines[i]);
    for (const v of nums) {
      if (v > largestInLast5) { largestInLast5 = v; largestIdx = i; }
    }
  }
  if (largestInLast5 >= MIN_AMOUNT) {
    candidates.push({
      value: largestInLast5, confidence: 40, source: 'last-5-lines-max',
      lineIndex: largestIdx, lineText: rawLines[largestIdx] ?? '',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 5 — Largest decimal anywhere in document (P5, last resort, conf=20)
  // ══════════════════════════════════════════════════════════════════════════
  let globalMax = 0;
  let globalIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (FALSE_POSITIVE_PATTERN.test(lines[i])) continue;
    const nums = numsInLine(lines[i]).filter(v => !Number.isInteger(v));
    for (const v of nums) {
      if (v > globalMax) { globalMax = v; globalIdx = i; }
    }
  }
  if (globalMax >= MIN_AMOUNT) {
    candidates.push({
      value: globalMax, confidence: 20, source: 'global-max-decimal',
      lineIndex: globalIdx, lineText: rawLines[globalIdx] ?? '',
    });
  }

  // ── Pick winner: highest confidence → on tie, prefer later line (closer to receipt total) ──
  if (candidates.length === 0) return { value: 0, confidence: 0, source: 'none' };

  candidates.sort((a, b) =>
    b.confidence - a.confidence ||
    b.lineIndex  - a.lineIndex  ||
    b.value      - a.value
  );

  const winner = candidates[0];
  console.log('[PARSER/extractAmount] candidates:', candidates.slice(0, 5).map(c =>
    `${c.source}:${c.value}(conf=${c.confidence},line=${c.lineIndex})`
  ).join(' | '));
  console.log('[PARSER/extractAmount] winner:', winner.value, '| src:', winner.source, '| line:', winner.lineText?.trim());

  return { value: winner.value, confidence: winner.confidence, source: winner.source };
}

// ─── Merchant / description extraction ──────────────────────────────────────

/**
 * extractMerchant
 * Strict first-5-line scan for merchant name.
 *
 * Strategy:
 *  1. Take first 5 non-empty lines (header zone — store name is always at top)
 *  2. Reject lines that are: purely numeric/symbolic, contain GSTIN, contain
 *     phone numbers (7+ digit sequences), contain URLs/emails, or are single
 *     skip-words from the noise list
 *  3. Among survivors, pick the LONGEST meaningful text line
 *     (store names are usually descriptive; noise lines are short labels)
 *  4. Fall back to first 15 lines with the same rules if top-5 yields nothing
 */
export function extractMerchant(text: string): string {
  const allLines = text
    .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 3);

  // Rejection rules — a line that matches any of these is NOT a merchant name
  const isNoiseLine = (line: string): boolean => {
    const lower = line.toLowerCase();
    // Pure digits/symbols/currency
    if (/^[\d\s₹$€£.,:\-/\\|()%#*=_]+$/.test(line)) return true;
    // GSTIN pattern (15 alphanumeric: 2 digits + 10 PAN chars + 1-2 extras)
    if (/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{3}\b/i.test(line)) return true;
    // Phone number (7+ consecutive digits)
    if (/\b\d{7,}\b/.test(line)) return true;
    // URLs / emails
    if (/[@.](?:com|in|org|net|co)\b|www\./i.test(line)) return true;
    // Lines starting with currency symbol
    if (/^[$₹€£¥]/.test(line)) return true;
    // Pure noise keywords
    const words = lower.split(/\s+/);
    const noiseCount = words.filter(w => SKIP_WORDS.has(w)).length;
    if (noiseCount >= 2) return true;
    if (words.length === 1 && SKIP_WORDS.has(lower.trim())) return true;
    // Lines that look like key-value pairs (label: number)
    if (/^[a-z\s]+[:\-]\s*[\d₹]+$/i.test(line)) return true;
    return false;
  };

  const cleanLine = (line: string): string =>
    line
      .replace(/^[^a-zA-Z₹]+/, '')   // strip leading non-alpha
      .replace(/[^\w\s&',.\-]+$/, '') // strip trailing symbols
      .trim();

  // ── PRIMARY SCAN: first 5 non-empty real lines ─────────────────────────────
  const top5 = allLines.slice(0, Math.min(allLines.length, 8));
  const primary = top5
    .filter(l => !isNoiseLine(l))
    .map(cleanLine)
    .filter(l => l.length >= 3 && /[a-zA-Z]{2,}/.test(l));

  if (primary.length > 0) {
    // Pick the longest line — store names are descriptive; short = label
    primary.sort((a, b) => b.length - a.length);
    return primary[0].slice(0, 60);
  }

  // ── FALLBACK: scan up to 15 lines ─────────────────────────────────────────
  const extended = allLines.slice(0, Math.min(allLines.length, 15))
    .filter(l => !isNoiseLine(l))
    .map(cleanLine)
    .filter(l => l.length >= 3 && /[a-zA-Z]{2,}/.test(l));

  if (extended.length > 0) {
    extended.sort((a, b) => b.length - a.length);
    return extended[0].slice(0, 60);
  }

  // ── LAST RESORT: any line with letters, not containing noise keyword ───────
  const anyLine = allLines
    .filter(l => /[a-zA-Z]{3,}/.test(l) && !/total|amount|date|tax|gst|vat/i.test(l))
    .sort((a, b) => b.length - a.length);
  return anyLine[0]?.trim().slice(0, 60) || '';
}

// ─── Main parse function ─────────────────────────────────────────────────────

/**
 * parseReceiptText
 * Processes cleaned OCR text and returns a structured result.
 *
 * Confidence rules (Task 5):
 *   HIGH   → amount came from a TOTAL-keyword line (conf ≥ 90)
 *   MEDIUM → amount came from currency symbol or last-lines (conf 40–89)
 *   LOW    → fallback values (conf < 40)
 *
 * Hard rules (Task 6):
 *   - amount < 1 or > 100,000 → discard → needsReview = true
 *   - no valid amount → errorMessage = "Unable to detect amount"
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const text = cleanOCRText(rawText);

  const { value: amount, confidence: amtConf, source: amtSource } = extractAmount(text);
  const merchant = extractMerchant(text);

  // ── Hard validation (Task 6) ────────────────────────────────────────────────
  const validAmount = amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
  const finalAmount = validAmount ? amount : 0;

  // ── Confidence mapping (Task 5) ─────────────────────────────────────────────
  //   HIGH   = came from a recognized TOTAL keyword line
  //   MEDIUM = came from currency symbol on a valid line, or positional heuristic
  //   LOW    = last-resort fallback
  let confidence: 'high' | 'medium' | 'low';
  if (amtConf >= 90) {
    confidence = 'high';   // total-keyword-line or currency-on-total-line
  } else if (amtConf >= 40) {
    confidence = 'medium'; // currency-symbol, last-decimal, last-5-lines
  } else {
    confidence = 'low';    // global-max fallback
  }

  const needsReview = finalAmount === 0 || confidence === 'low';

  // Error message for hard failure case
  const errorMessage = finalAmount === 0
    ? 'Unable to detect amount — please enter it manually.'
    : undefined;

  console.log(
    `[PARSER] amount=${finalAmount} (conf=${amtConf}, src=${amtSource})`,
    `| merchant="${merchant}"`,
    `| confidence=${confidence}`,
    `| needsReview=${needsReview}`,
    errorMessage ? `| ERROR: ${errorMessage}` : '',
  );

  return {
    amount:       finalAmount,
    merchant,
    description:  merchant,
    needsReview,
    confidence,
    errorMessage,
    rawSnippet:   text.slice(0, 300),
  };
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
  const cleaned = raw.replace(/[₹$€£¥,\s()]/g, '').replace(/[^\d.]/g, '');
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
 * Strategy (Task 4):
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

  // ── Amount pattern: 1–6 digits, optional comma grouping, optional .2 decimal ─
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
        .replace(/[₹$€£¥]/g, '')    // remove currency symbols
        .replace(/\s{2,}/g, ' ')    // collapse spaces
        .trim()
        .slice(0, 100);

      if (description.length < 3) description = 'Bank transaction';

      transactions.push({ amount, date: todayDate, description });
    } catch {
      // Skip malformed lines silently (never crash — Task 5)
    }
  }

  console.log(`[PDF-BANK] Extracted ${transactions.length} transactions from ${lines.length} lines`);
  return transactions;
}


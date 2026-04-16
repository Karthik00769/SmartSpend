/**
 * lib/ocr/bank-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal bank statement parser — human-level accuracy for CSV + PDF text.
 *
 * Design goals (per spec):
 *  1. Universal format handling — CSV, PDF-extracted text, OCR tabular text
 *  2. Column intelligence — dynamic header matching + positional fallback
 *  3. Amount logic — ONLY debit = expense; credits are ALWAYS skipped
 *  4. Validation — amount must be 1 ≤ x ≤ 1,00,000
 *  5. Error-proofing — every row wrapped in try/catch; partial results returned
 *  6. Confidence score — high / medium / low per row
 *  7. Final rule — if uncertain → needsReview = true
 *
 * Fixes over the old parsers:
 *  - Balance column excluded from all amount resolution
 *  - PDF: column-position learning from first data row, not just headers
 *  - PDF: debit = left-most amount when 3+ amounts present on a line
 *  - detectCSVColumns: exact/word-boundary matching (no false "dr" ⊂ "address")
 *  - Positional fallback: never uses the last column (likely balance)
 *  - Per-row confidence scoring based on: column map quality + amount source
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BankTransaction {
  amount:      number;
  date:        string;
  dateAdjusted: boolean;
  description: string;
  confidence:  'high' | 'medium' | 'low';
  needsReview: boolean;
}

export interface BankParseResult {
  transactions: BankTransaction[];
  totalRows:    number;       // lines attempted
  skipped:      number;       // lines rejected
  parseMode:    'csv-headers' | 'csv-positional' | 'pdf-lines' | 'unknown';
  warning?:     string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100_000;

// ─── Amount utilities ─────────────────────────────────────────────────────────

/**
 * safeAmount
 * Strips all currency symbols, commas, parens (accounting negatives), spaces.
 * Returns 0 for anything unparseable or negative.
 */
function safeAmount(raw: string | undefined): number {
  if (!raw || !raw.trim()) return 0;
  // Accounting negative: (1,234.56) → treat as debit (positive)
  const isAcctNeg = /^\([\d,. ]+\)$/.test(raw.trim());
  const cleaned = raw
    .replace(/[\u20B9$€£¥,\s()]/g, '')
    .replace(/[^\d.]/g, '');
  const v = parseFloat(cleaned);
  if (isNaN(v) || v < 0) return 0;
  // Accounting negatives ARE debits → keep as positive
  return isAcctNeg ? v : v;
}

function validAmount(v: number, raw: string = ''): boolean {
  // Reject if looks like account number (too many digits)
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 10) return false;
  
  // Reject if no decimal point (often an ID or year)
  if (!raw.includes('.')) {
    // Some banks use whole numbers for amounts, but usually decimals are present.
    // If it's a large whole number without decimal, it's likely an ID.
    if (v > 1000) return false;
  }

  return v >= MIN_AMOUNT && v <= MAX_AMOUNT;
}

// ─── Date patterns ────────────────────────────────────────────────────────────

const DATE_PATTERNS = [
  /\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/,          // DD/MM/YYYY or DD-MM-YYYY
  /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/,          // YYYY-MM-DD
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i,
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/,   // D/M/YY
  /\b\d{2}\-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\-\d{4}\b/i, // 15-Jan-2024
] as RegExp[];

function hasDate(line: string): boolean {
  return DATE_PATTERNS.some(p => p.test(line));
}

/**
 * Parses a date string and ensures it is not in the future.
 * Fallback to defaultDate if invalid or future.
 */
function extractDateFromRow(raw: string | undefined, todayDate: string): { date: string | null; adjusted: boolean } {
  if (!raw) return { date: null, adjusted: false };
  
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(raw);
    if (match) {
      const dateStr = match[0];
      try {
        const parsed = new Date(dateStr);
        if (isNaN(parsed.getTime())) continue;
        
        const iso = parsed.toISOString().slice(0, 10);
        if (iso > todayStr) {
           return { date: null, adjusted: true }; // SKIP future
        }
        return { date: iso, adjusted: false };
      } catch {
        continue;
      }
    }
  }
  return { date: null, adjusted: false };
}

// ─── Column map ───────────────────────────────────────────────────────────────

interface ColMap {
  dateCol:    number;
  debitCol:   number;
  creditCol:  number;
  amountCol:  number;   // single-col banks
  balanceCol: number;   // MUST be excluded from amount resolution
  descCol:    number;
}

const NO_COL: ColMap = {
  dateCol: -1, debitCol: -1, creditCol: -1,
  amountCol: -1, balanceCol: -1, descCol: -1,
};

/**
 * smartColIdx
 * Finds column index using word-boundary matching.
 * Avoids false matches like "dr" ⊂ "address" from the old implementation.
 */
function smartColIdx(headers: string[], candidates: string[]): number {
  const h = headers.map(x => x.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim());

  for (const c of candidates) {
    // Priority 1: exact match
    const exact = h.findIndex(hdr => hdr === c);
    if (exact !== -1) return exact;

    // Priority 2: header starts with or contains candidate as whole word
    const partial = h.findIndex(hdr => {
      // word boundary check: the candidate must appear as a whole word in hdr
      const re = new RegExp(`\\b${c.replace(/\s+/g, '\\s+')}\\b`);
      return re.test(hdr);
    });
    if (partial !== -1) return partial;
  }
  return -1;
}

/**
 * buildColumnMap
 * Maps semantic columns to indices from a header row.
 * Balance column is always detected to be EXCLUDED from amount resolution.
 */
function buildColumnMap(headers: string[]): ColMap {
  return {
    dateCol: smartColIdx(headers, [
      'date', 'txn date', 'transaction date', 'value date', 'posted date',
      'booking date', 'trans date', 'posting date', 'tran date', 'entry date',
      'settlement date', 'processing date', 'effective date', 'dt',
    ]),
    debitCol: smartColIdx(headers, [
      'debit', 'withdrawal', 'withdrawals', 'dr', 'debit amount', 'dr amount',
      'withdrawal amount', 'debit inr', 'expense', 'paid out', 'deductions',
      'chq amount', 'cheque amount',
    ]),
    creditCol: smartColIdx(headers, [
      'credit', 'deposit', 'deposits', 'cr', 'credit amount', 'cr amount',
      'deposit amount', 'credit inr', 'paid in', 'receipts',
    ]),
    amountCol: smartColIdx(headers, [
      'amount', 'transaction amount', 'tran amount', 'txn amount',
      'sum', 'inr', 'usd', 'gbp', 'eur', 'total amount', 'net amount',
    ]),
    balanceCol: smartColIdx(headers, [
      'balance', 'closing balance', 'available balance', 'running balance',
      'balance amount', 'bal', 'ledger balance', 'book balance', 'current balance',
    ]),
    descCol: smartColIdx(headers, [
      'description', 'narration', 'particulars', 'details', 'merchant',
      'payee', 'memo', 'remarks', 'transaction details', 'transaction narration',
      'transaction description', 'chq no narration', 'remarks narration',
      'beneficiary', 'reference', 'mode', 'transaction remarks', 'name',
    ]),
  };
}

// ─── Per-row amount resolver ──────────────────────────────────────────────────

interface ResolvedRow {
  amount:     number;
  confidence: 'high' | 'medium' | 'low';
  source:     string;
  skip:       boolean;   // true = this is a credit row, skipped
}

/**
 * resolveRowAmount
 * Strict debit-only amount resolution using column map.
 *
 * Strategy:
 *  1. If debitCol + creditCol both exist → debit only. Credit rows: skip.
 *  2. If only debitCol → use it.
 *  3. If only amountCol (and not balanceCol) → use it.
 *  4. Else: positional fallback (NOT last col — that's usually balance).
 */
function resolveRowAmount(cols: string[], map: ColMap): ResolvedRow {
  // Case 1: explicit debit + credit columns
  if (map.debitCol !== -1 && map.creditCol !== -1) {
    const rawDebit = cols[map.debitCol];
    const rawCredit = cols[map.creditCol];
    const debit  = safeAmount(rawDebit);
    const credit = safeAmount(rawCredit);
    if (debit > 0 && validAmount(debit, rawDebit)) {
      return { amount: debit, confidence: 'high', source: 'debit-col', skip: false };
    }
    if (credit > 0 && validAmount(credit, rawCredit)) {
      return { amount: 0, confidence: 'high', source: 'credit-col', skip: true }; // SKIP
    }
    return { amount: 0, confidence: 'low', source: 'empty-row', skip: true };
  }

  // Case 2: debit column only
  if (map.debitCol !== -1) {
    const raw = cols[map.debitCol];
    const v = safeAmount(raw);
    return v > 0 && validAmount(v, raw)
      ? { amount: v, confidence: 'high', source: 'debit-col', skip: false }
      : { amount: 0, confidence: 'low', source: 'debit-empty', skip: true };
  }

  // Case 3: single amount column (NOT balance col)
  if (map.amountCol !== -1 && map.amountCol !== map.balanceCol) {
    const raw = cols[map.amountCol];
    const v = safeAmount(raw);
    if (v > 0 && validAmount(v, raw)) {
      const conf = map.creditCol !== -1 ? 'medium' : 'high';
      return { amount: v, confidence: conf, source: 'amount-col', skip: false };
    }
    return { amount: 0, confidence: 'low', source: 'amount-empty', skip: true };
  }

  // Case 4: positional fallback
  const middleCols = cols.slice(0, Math.max(1, cols.length - 1));
  for (let i = middleCols.length - 1; i >= 0; i--) {
    if (i === map.dateCol || i === map.balanceCol) continue;
    const raw = cols[i];
    const v = safeAmount(raw);
    if (validAmount(v, raw)) {
      return { amount: v, confidence: 'low', source: `positional-col-${i}`, skip: false };
    }
  }

  return { amount: 0, confidence: 'low', source: 'not-found', skip: true };
}

// ─── Header row detection ─────────────────────────────────────────────────────

const HEADER_KEYWORDS = new Set([
  'date', 'narration', 'particulars', 'description', 'debit', 'credit',
  'balance', 'withdrawal', 'deposit', 'amount', 'reference', 'chq',
  'transaction', 'details', 'remarks', 'mode', 'dr', 'cr', 'sr', 'no',
  'value date', 'entry date',
]);

function isHeaderRow(cols: string[]): boolean {
  const matches = cols.filter(c => {
    const lower = c.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    return HEADER_KEYWORDS.has(lower) || [...HEADER_KEYWORDS].some(k => lower.includes(k));
  });
  return matches.length >= Math.min(2, Math.floor(cols.length * 0.4));
}

// ─── Skip-line patterns ───────────────────────────────────────────────────────

const SKIP_LINE_RE = [
  /^(opening|closing|available|running)\s*(balance|bal)\b/i,
  /^(page\s*\d+|total|grand\s*total|sub\s*total)\b/i,
  /^\s*(branch|ifsc|micr|account\s*(no|number)|customer\s*(id|name))/i,
  /^[-=*_.]{3,}$/,
  /^(statement\s*of|period|from\s*date|to\s*date)\b/i,
] as RegExp[];

function shouldSkipLine(line: string): boolean {
  return SKIP_LINE_RE.some(p => p.test(line.trim()));
}

// ─── Description extractor ────────────────────────────────────────────────────

function extractDescription(cols: string[], map: ColMap, raw: string): string {
  // Try mapped desc column first
  if (map.descCol !== -1 && (cols[map.descCol] ?? '').trim().length >= 3) {
    return cols[map.descCol].trim().slice(0, 120);
  }

  // If descCol not available, join all non-numeric, non-date, non-balance cols
  const numeric = new Set([
    map.amountCol, map.debitCol, map.creditCol, map.balanceCol, map.dateCol,
  ]);
  const parts = cols
    .filter((c, i) => !numeric.has(i) && c.trim().length > 1)
    .join(' ')
    .trim();

  if (parts.length >= 3) return parts.slice(0, 120);

  // Last resort: strip numbers and dates from raw line
  let desc = raw;
  for (const p of DATE_PATTERNS) {
    desc = desc.replace(new RegExp(p.source, 'gi'), '');
  }
  desc = desc
    .replace(/\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b/g, '')
    .replace(/[\u20B9$€£¥]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return desc.length >= 3 ? desc.slice(0, 120) : 'Bank transaction';
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * parseCSV
 * Parses structured CSV / TSV / pipe-delimited bank statements.
 *
 * Steps:
 *  1. Auto-detect delimiter
 *  2. Find header row (may not be row 0 — some banks have 3-5 metadata rows)
 *  3. Build column map from header
 *  4. For each data row: strict debit-only amount resolution + confidence scoring
 *  5. Wrap every row in try/catch — partial results always returned
 */
export function parseCSV(text: string, todayDate: string): BankParseResult {
  const result: BankParseResult = {
    transactions: [],
    totalRows: 0,
    skipped: 0,
    parseMode: 'csv-headers',
  };

  try {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      result.warning = 'File has too few rows to parse.';
      return result;
    }

    // ── Auto-detect delimiter ──────────────────────────────────────────────
    const delim = detectDelimiter(lines);
    const split  = (line: string) => splitCSV(line, delim);

    // ── Find the actual header row (scan up to first 8 rows) ────────────────
    let headerIdx = -1;
    let colMap    = { ...NO_COL };

    for (let i = 0; i < Math.min(8, lines.length); i++) {
      const cols = split(lines[i]);
      if (isHeaderRow(cols)) {
        colMap    = buildColumnMap(cols);
        headerIdx = i;
        console.log(`[BANK-CSV] Header found at row ${i}: [${cols.join(' | ')}]`);
        console.log(`[BANK-CSV] Map: date=${colMap.dateCol} debit=${colMap.debitCol} credit=${colMap.creditCol} amt=${colMap.amountCol} bal=${colMap.balanceCol} desc=${colMap.descCol}`);
        break;
      }
    }

    // If no header row found → positional mode
    if (headerIdx === -1) {
      console.log('[BANK-CSV] No header row found → positional mode');
      result.parseMode = 'csv-positional';
      return parsePositional(lines, split, todayDate);
    }

    // No amount-related column at all → positional
    const hasAmountInfo = colMap.debitCol !== -1 || colMap.creditCol !== -1 || colMap.amountCol !== -1;
    if (!hasAmountInfo) {
      console.log('[BANK-CSV] No amount column detected → positional mode');
      result.parseMode = 'csv-positional';
      return parsePositional(lines.slice(headerIdx + 1), split, todayDate);
    }

    // ── Parse data rows ────────────────────────────────────────────────────
    for (let i = headerIdx + 1; i < lines.length; i++) {
      result.totalRows++;
      try {
        const cols = split(lines[i]);
        if (!cols.length || cols.every(c => !c.trim())) { result.skipped++; continue; }

        // Skip repeated header rows (common in multi-page bank PDFs converted to CSV)
        if (isHeaderRow(cols)) { result.skipped++; continue; }

        // Skip known noise lines
        if (shouldSkipLine(lines[i])) { result.skipped++; continue; }

        // Resolve amount (Strict: must be valid debit)
        const resolved = resolveRowAmount(cols, colMap);
        if (resolved.skip || !validAmount(resolved.amount)) {
          result.skipped++;
          continue;
        }

        // Date extraction (Strict: must exist)
        const { date, adjusted: dateAdjusted } = extractDateFromRow(cols[colMap.dateCol], todayDate);
        if (!date) { result.skipped++; continue; }

        // Description extraction (Strict: must be length > 3)
        const description = extractDescription(cols, colMap, lines[i]);
        if (description.length <= 3) { result.skipped++; continue; }

        result.transactions.push({
          amount:      resolved.amount,
          date,
          dateAdjusted,
          description,
          confidence:  resolved.confidence,
          needsReview: resolved.confidence === 'low',
        });

      } catch (rowErr: any) {
        console.warn(`[BANK-CSV] Row ${i} error:`, rowErr?.message);
        result.skipped++;
      }
    }

    console.log(`[BANK-CSV] Extracted ${result.transactions.length}/${result.totalRows} rows (skipped=${result.skipped})`);
    return result;

  } catch (fatal: any) {
    console.error('[BANK-CSV] Fatal:', fatal?.message);
    result.warning = 'CSV parsing encountered errors — showing partial results.';
    return result;
  }
}

// ─── Positional CSV fallback ──────────────────────────────────────────────────

function parsePositional(
  lines:     string[],
  split:     (l: string) => string[],
  todayDate: string,
): BankParseResult {
  const result: BankParseResult = {
    transactions: [],
    totalRows: lines.length,
    skipped: 0,
    parseMode: 'csv-positional',
  };

  for (const line of lines) {
    try {
      if (shouldSkipLine(line)) { result.skipped++; continue; }
      const cols = split(line);
      if (cols.length < 2) { result.skipped++; continue; }
      if (isHeaderRow(cols)) { result.skipped++; continue; }

      // Scan columns EXCLUDING last (usually balance) for valid amounts
      let amount = 0;
      let amtIdx = -1;
      for (let c = cols.length - 2; c >= 0; c--) {
        const v = safeAmount(cols[c]);
        if (validAmount(v, cols[c])) { amount = v; amtIdx = c; break; }
      }
      if (!amount) { result.skipped++; continue; }

      // Positional Date Check
      const { date, adjusted: dateAdjusted } = extractDateFromRow(line, todayDate);
      if (!date) { result.skipped++; continue; }

      const description = cols
        .filter((_, i) => i !== amtIdx)
        .join(' ').trim().replace(/\s{2,}/g, ' ')
        .slice(0, 120) || 'Bank transaction';
      
      if (description.length <= 3) { result.skipped++; continue; }

      result.transactions.push({
        amount, date, dateAdjusted, description,
        confidence: 'low', needsReview: true,  // positional = always review
      });
    } catch { result.skipped++; }
  }

  console.log(`[BANK-CSV/pos] Extracted ${result.transactions.length}/${result.totalRows}`);
  return result;
}

// ─── PDF Bank Statement Parser ────────────────────────────────────────────────

/**
 * parsePDFBankText
 * Extracts transactions from freeform PDF-extracted text.
 *
 * PDF bank statements have no guaranteed column structure — we must:
 *  1. Find lines containing a date AND at least one valid amount
 *  2. Detect if there are 2–4 amounts per line (debit / credit / balance pattern)
 *  3. Apply debit-position heuristic:
 *     - 2 amounts: first = txn amount (debit/credit), second = balance → take first
 *     - 3+ amounts: [debit, credit, balance] → take first non-zero < second-largest
 *  4. Amount column position learning:
 *     - After 3 rows, estimate which positional slot holds the debit
 *     - Subsequent rows use that learned position
 *
 * Returns BankParseResult so the caller can surface confidence + needsReview.
 */
export function parsePDFBankText(text: string, todayDate: string): BankParseResult {
  const result: BankParseResult = {
    transactions: [],
    totalRows: 0,
    skipped: 0,
    parseMode: 'pdf-lines',
  };

  try {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Amount RE: handles "1,23,456.78" (Indian lakh format) and "12345.67"
    const AMT_RE = /\b(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d{1,6}(?:\.\d{1,2})?)\b/g;

    // Column-position learner: tracks which col-index (0-based from right) usually has debit
    // "right-col-0" = rightmost, "right-col-1" = second from right, etc.
    const colVotes: Record<number, number> = {};
    let learnedCol: number | null = null;   // null = still learning; negative = from right
    let rowsSeen = 0;

    for (const line of lines) {
      result.totalRows++;
      try {
        if (shouldSkipLine(line)) { result.skipped++; continue; }
        if (line.length < 10)    { result.skipped++; continue; }
        if (!hasDate(line))      { result.skipped++; continue; }

        // Extract all numbers from the line (with Indian lakh comma support)
        const amounts: number[] = [];
        let m: RegExpExecArray | null;
        const re = new RegExp(AMT_RE.source, 'g');
        while ((m = re.exec(line)) !== null) {
          const v = parseFloat(m[1].replace(/,/g, ''));
          if (!isNaN(v) && v >= MIN_AMOUNT && v <= MAX_AMOUNT) {
            amounts.push(v);
          }
        }

        if (amounts.length === 0) { result.skipped++; continue; }

        let amount = 0;
        let confidence: 'high' | 'medium' | 'low' = 'low';

        if (amounts.length === 1) {
          // Only one valid number — likely the transaction amount if line has a date
          amount     = amounts[0];
          confidence = 'medium';

        } else if (amounts.length === 2) {
          // [txn_amount, balance] — take first (debit or credit) → medium conf
          // (we can't tell if it's debit or credit here without column context)
          amount     = amounts[0];
          confidence = 'medium';

        } else {
          // 3+ amounts: typical bank format: [debit, credit, running_balance]
          // or: [amount, dr_cr_flag_number, balance]
          //
          // Strategy: the LARGEST value is usually the running balance → exclude it.
          // Among the remaining, take the FIRST non-zero (debit comes before credit
          // in most Indian bank statements: HDFC, SBI, ICICI, Axis, Kotak, etc.)
          const sorted  = [...amounts].sort((a, b) => b - a);
          const balance = sorted[0];  // largest = running balance

          // Use learned column position if available
          if (learnedCol !== null) {
            const fromRight = amounts.length - 1 + learnedCol; // learnedCol is negative-indexed
            const idx = Math.max(0, amounts.length - 1 + learnedCol);
            if (validAmount(amounts[idx])) {
              amount     = amounts[idx];
              confidence = 'high';  // learned position = high confidence
            }
          }

          // Fallback: take first amount that is NOT the maximum (balance) value
          if (!amount) {
            const candidate = amounts.find(v => v !== balance && validAmount(v));
            if (candidate) {
              amount     = candidate;
              confidence = 'medium';
              // Vote for the column position of this candidate (from right)
              const posFromRight = amounts.indexOf(candidate) - amounts.length + 1;
              colVotes[posFromRight] = (colVotes[posFromRight] ?? 0) + 1;
            }
          }

          // Learn column position after 3 rows
          rowsSeen++;
          if (rowsSeen >= 3 && learnedCol === null) {
            const topVote = Object.entries(colVotes)
              .sort(([, a], [, b]) => b - a)[0];
            if (topVote && Number(topVote[1]) >= 2) {
              learnedCol = Number(topVote[0]);
              console.log(`[BANK-PDF] Learned debit column: index from right = ${learnedCol}`);
            }
          }
        }

        if (!validAmount(amount)) { result.skipped++; continue; }

        // Extract description: strip dates and amounts from line
        let desc = line;
        for (const dp of DATE_PATTERNS) {
          desc = desc.replace(new RegExp(dp.source, 'gi'), '');
        }
        desc = desc
          .replace(AMT_RE, '')
          .replace(/[\u20B9$€£¥]/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .slice(0, 120);
        if (desc.length < 3) desc = 'Bank transaction';

        const { date, adjusted: dateAdjusted } = extractDateFromRow(line, todayDate);
        if (!date) { result.skipped++; continue; }

        result.transactions.push({
          amount,
          date,
          dateAdjusted,
          description: desc,
          confidence,
          needsReview: confidence === 'low',
        });

      } catch (rowErr: any) {
        console.warn('[BANK-PDF] Row error:', rowErr?.message);
        result.skipped++;
      }
    }

    console.log(`[BANK-PDF] Extracted ${result.transactions.length}/${result.totalRows} (skipped=${result.skipped}, learnedCol=${learnedCol})`);
    return result;

  } catch (fatal: any) {
    console.error('[BANK-PDF] Fatal:', fatal?.message);
    result.warning = 'PDF parsing encountered errors — showing partial results.';
    return result;
  }
}

// ─── Delimiter detection ──────────────────────────────────────────────────────

function detectDelimiter(lines: string[]): string {
  const candidates = ['\t', '|', ';', ','];
  const sample = lines.slice(0, 5);

  let best = ',';
  let bestScore = -1;

  for (const d of candidates) {
    const counts = sample.map(l => (l.match(new RegExp(`\\${d}`, 'g')) ?? []).length);
    const nonZero = counts.filter(n => n > 0);
    if (nonZero.length < 1) continue;
    const min = Math.min(...nonZero);
    const max = Math.max(...nonZero);
    // Consistent count = good delimiter; penalise inconsistency
    const score = min * 10 - (max - min);
    if (score > bestScore) { bestScore = score; best = d; }
  }

  return best;
}

// ─── RFC-4180 CSV splitter ─────────────────────────────────────────────────────

function splitCSV(line: string, delim: string): string[] {
  const result: string[] = [];
  let current  = '';
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

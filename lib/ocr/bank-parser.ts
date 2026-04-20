/**
 * lib/ocr/bank-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Simplified, production-grade parser for bank statements.
 */
export interface BankTransaction {
  amount: number;
  date: string;
  dateAdjusted: boolean;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
}

export interface BankParseResult {
  transactions: BankTransaction[];
  totalRows: number;
  skipped: number;
  parseMode: 'csv-headers' | 'csv-positional' | 'pdf-lines' | 'unknown';
  warning?: string;
}

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100000;

const DATE_PATTERNS = [
  /\b\d{2}[\/\-.:]\d{2}[\/\-.:]\d{4}\b/,
  /\b\d{4}[\/\-.:]\d{2}[\/\-.:]\d{2}\b/,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i,
  /\b\d{1,2}[\/\-.:]\d{1,2}[\/\-.:]\d{2,4}\b/,
  /\b\d{2}\-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\-\d{4}\b/i,
];

function extractDate(str: string, todayDate: string): { date: string | null; dateAdjusted: boolean } {
  if (!str) return { date: null, dateAdjusted: false };
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(str);
    if (match) {
      try {
        let parsed = new Date(match[0]);
        if (isNaN(parsed.getTime())) {
          // Fallback parsing for DD/MM/YYYY vs MM/DD/YYYY timezone confusion
          const parts = match[0].split(/[\/\-.:]/);
          if (parts.length === 3) {
            parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // force YYYY-MM-DD
          }
        }
        if (isNaN(parsed.getTime())) continue;
        const iso = parsed.toISOString().slice(0, 10);
        if (iso > todayDate) return { date: null, dateAdjusted: true }; // Skip future
        return { date: iso, dateAdjusted: false };
      } catch (e) {
        continue;
      }
    }
  }
  return { date: null, dateAdjusted: false };
}

function parseAmount(str: string): number {
  if (!str) return 0;
  // Strip spaces, symbols, keep only numbers, period, comma
  const raw = str.replace(/[^0-9.,]/g, '');
  if (!raw) return 0;

  const val = parseFloat(raw.replace(/,/g, ''));
  if (isNaN(val) || val < MIN_AMOUNT || val > MAX_AMOUNT) return 0;
  
  const parts = raw.split('.');
  const intPart = parts[0].replace(/,/g, '');
  
  // Exclude extremely long integers (e.g. account / ref numbers)
  if (parts.length === 1 && intPart.length > 4) return 0;
  if (parts.length > 1 && intPart.length > 6) return 0;
  
  return val;
}

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
    const score = min * 10 - (max - min);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function processRows(rows: string[][], todayDate: string, parseMode: any): BankParseResult {
  const result: BankParseResult = {
    transactions: [],
    totalRows: 0,
    skipped: 0,
    parseMode,
  };

  let headerRowIdx = -1;
  let map = { date: -1, desc: -1, debit: -1, credit: -1, amount: -1, balance: -1 };

  // 1. IDENTIFY COLUMNS FROM HEADERS
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i].map(c => c.toLowerCase());
    const hasDateStr = row.some(c => c.includes('date') || c.includes('dt'));
    const hasDescStr = row.some(c => c.includes('desc') || c.includes('particulars') || c.includes('narration'));
    const hasAmtStr = row.some(c => c.includes('amount') || c.includes('debit') || c.includes('withdrawal'));
    
    // Check if row has data (prevent confusing a header with a data row)
    const hasRealDate = row.some(c => extractDate(c, todayDate).date !== null);
    
    if (!hasRealDate && (hasDateStr || hasDescStr || hasAmtStr)) {
      const findCol = (keywords: string[]) => row.findIndex(c => keywords.some(k => c === k || c.includes(k)));
      
      map.date = findCol(['date', 'dt', 'value date', 'txn date']);
      map.desc = findCol(['desc', 'description', 'particulars', 'narration', 'detail', 'payee', 'remark']);
      map.debit = findCol(['debit', 'dr', 'withdrawal', 'paid out']);
      map.credit = findCol(['credit', 'cr', 'deposit', 'paid in']);
      map.amount = findCol(['amount', 'inr', 'sum']);
      map.balance = findCol(['balance', 'bal']);
      
      if (map.date !== -1 || map.debit !== -1 || map.amount !== -1) {
          headerRowIdx = i;
          break;
      }
    }
  }

  // 1b. Fallback: Infer columns from data row structure
  if (headerRowIdx === -1) {
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      let dateCol = -1;
      let numCols: number[] = [];
      for (let j = 0; j < row.length; j++) {
        if (extractDate(row[j], todayDate).date) {
            dateCol = j;
        } else if (parseAmount(row[j]) > 0) {
            numCols.push(j);
        }
      }
      if (dateCol !== -1 && numCols.length > 0) {
        headerRowIdx = i - 1; 
        map.date = dateCol;
        map.desc = row.findIndex((c, j) => j !== dateCol && !numCols.includes(j) && c.trim().length > 3);
        
        // Pattern: [..., Debit, Credit, Balance] or [..., Amount]
        if (numCols.length === 1) {
          map.amount = numCols[0];
        } else if (numCols.length >= 2) {
          map.debit = numCols[0];
          map.credit = numCols[1];
          if (numCols.length >= 3) map.balance = numCols[numCols.length - 1]; // assumed last
        }
        break;
      }
    }
  }

  if (headerRowIdx === -1 && map.date === -1) {
    return result; 
  }

  // Parses data rows
  const startIdx = Math.max(0, headerRowIdx + 1);
  for (let i = startIdx; i < rows.length; i++) {
    result.totalRows++;
    try {
      const row = rows[i];
      if (row.length < 2) { result.skipped++; continue; }

      // SKIP balance-defining rows or invalid headers
      const rowStr = row.join(' ').toLowerCase();
      if (rowStr.includes('opening balance') || rowStr.includes('closing balance') || rowStr.includes('tot')) { 
        result.skipped++; continue; 
      }

      const { date, dateAdjusted } = extractDate(row[map.date !== -1 ? map.date : 0] || rowStr, todayDate);
      if (!date) { result.skipped++; continue; }

      let finalAmount = 0;

      // 2. HANDLE TYPES
      // CASE B: debit + credit columns → ONLY use debit. IGNORE credit.
      if (map.debit !== -1 && map.credit !== -1) {
        const debitAmt = parseAmount(row[map.debit]);
        const creditAmt = parseAmount(row[map.credit]);
        if (debitAmt > 0) {
          finalAmount = debitAmt;
        } else if (creditAmt > 0) {
          result.skipped++; continue; // Explicitly skip if it's a credit
        }
      } 
      // CASE A: single amount column
      else if (map.amount !== -1) {
        finalAmount = parseAmount(row[map.amount]);
      } 
      else if (map.debit !== -1) {
        finalAmount = parseAmount(row[map.debit]);
      }

      // 3. STRICT FILTER
      if (finalAmount < MIN_AMOUNT || finalAmount > MAX_AMOUNT) {
        result.skipped++; continue;
      }

      // STRICT FILTER & REMOVE REF # for description
      let desc = '';
      if (parseMode === 'csv-headers' && map.desc !== -1 && row[map.desc]) {
        desc = row[map.desc].trim();
      } else {
        // For PDF or positional fallback, reconstruct description from all non-metric columns
        desc = row.filter((c, j) => j !== map.date && j !== map.debit && j !== map.credit && j !== map.amount && j !== map.balance).join(' ').trim();
      }
      
      desc = desc.replace(new RegExp(DATE_PATTERNS.map(p => p.source).join('|'), 'gi'), '')
                 .replace(/[0-9.,]{4,}/g, '') // remove trailing ref numbers or stray large sets of numbers
                 .replace(/[\u20B9$€£¥]/g, '')
                 .replace(/\s{2,}/g, ' ')
                 .trim();

      if (desc.length <= 3) {
        result.skipped++; continue;
      }

      // Add as purely parsed valid outcome
      result.transactions.push({
        amount: finalAmount,
        date,
        dateAdjusted,
        description: desc.slice(0, 120),
        confidence: 'high',   // Because we are extracting strictly based on columns layout
        needsReview: false
      });

    } catch (e) {
      result.skipped++;
    }
  }

  return result;
}

export function parseCSV(text: string, todayDate: string): BankParseResult {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return { transactions: [], totalRows: 0, skipped: 0, parseMode: 'csv-headers' };
  
  const delim = detectDelimiter(lines);
  const rows = lines.map(l => splitCSV(l, delim));
  return processRows(rows, todayDate, 'csv-headers');
}

export function parsePDFBankText(text: string, todayDate: string): BankParseResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result: BankParseResult = { transactions: [], totalRows: lines.length, skipped: 0, parseMode: 'pdf-lines' };

  for (const line of lines) {
    // STEP 1: LINE FILTER (Date + Number)
    const { date, dateAdjusted } = extractDate(line, todayDate);
    if (!date) {
      result.skipped++;
      continue;
    }
    
    // STEP 2: TOKEN CLASSIFICATION
    // Extract tokens - any solid block of text or numbers
    const tokens = line.split(/\s+/).filter(t => t.length > 0);
    
    const amounts: number[] = [];
    const textTokens: string[] = [];
    
    for (const token of tokens) {
      // Is it a date? (heuristic: wait, we already extracted date from the line, just remove the date string if it matched but let's be simpler)
      // We know `date` is extracted. To find amount vs text:
      // Strip commas from numbers
      const numStr = token.replace(/,/g, '');
      const parsedNum = parseFloat(numStr);
      
      // If it's a valid decimal or integer amount and looks like an amount not a date
      if (!isNaN(parsedNum) && /[0-9]+\.[0-9]{2}$/.test(numStr)) {
        amounts.push(parsedNum);
      } else if (!isNaN(parsedNum) && /^[0-9]+$/.test(numStr) && numStr.length >= 2 && numStr.length <= 6) {
        amounts.push(parsedNum);
      } else {
        // Also ensure not matching the parsed date directly
        textTokens.push(token);
      }
    }
    
    // STEP 3: AMOUNT DETECTION
    // Pick LAST valid amount in line. BUT ignore largest (balance).
    let finalAmount = 0;
    let desc = '';
    
    if (amounts.length === 0) {
      result.skipped++;
      continue;
    } else if (amounts.length === 1) {
      finalAmount = amounts[0];
    } else {
      // Find largest (usually balance)
      const maxAmt = Math.max(...amounts);
      // Remove maxAmt if it's strictly greater than other amounts 
      // (in case amount == balance, we shouldn't drop both actually)
      const filteredAmounts = amounts.filter(a => a !== maxAmt);
      if (filteredAmounts.length > 0) {
        // Pick the last valid amount from the filtered list (usually credit/debit)
        finalAmount = filteredAmounts[filteredAmounts.length - 1];
      } else {
        finalAmount = amounts[amounts.length - 1];
      }
    }
    
    if (finalAmount < MIN_AMOUNT || finalAmount > MAX_AMOUNT) {
      result.skipped++;
      continue;
    }
    
    // STEP 4: DESCRIPTION
    // Everything except date + amount -> re-build description from text tokens
    // Make sure we strip any dates
    desc = textTokens.join(' ')
           .replace(new RegExp(DATE_PATTERNS.map(p => p.source).join('|'), 'gi'), '')
           .replace(/^[0-9.,]+$/, '') // drop single dangling references
           .trim();
           
    if (desc.length <= 3) {
      result.skipped++;
      continue;
    }
    
    // CRITICAL: if confidence < 70% needsReview: true 
    // Here we strictly define confidence based on token clarity
    // If we had many ambiguous amounts, confidence drops
    const isMediumConfidence = amounts.length > 3 || desc.length < 5;
    
    result.transactions.push({
      amount: finalAmount,
      date,
      dateAdjusted,
      description: desc.slice(0, 120),
      confidence: isMediumConfidence ? 'low' : 'high',
      needsReview: isMediumConfidence
    });
  }
  
  return result;
}

import { RawBankTransaction } from '../types';
import { detectHeaderRow } from '../formats';
import { cleanWhitespace } from '../utils';

export function parseCSVGrid(rows: string[][]): RawBankTransaction[] {
  const { headerIdx, map } = detectHeaderRow(rows);
  
  // If no header could be detected dynamically, we might need a fallback.
  // For now, if we can't detect a structure, we return empty (strict extraction)
  if (headerIdx === -1 || map.date === -1) {
    return [];
  }

  const transactions: RawBankTransaction[] = [];
  const startIdx = headerIdx + 1;
  let currentTx: RawBankTransaction | null = null;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip completely empty rows
    if (row.length === 0 || row.every(cell => !cell.trim())) continue;

    const dateRaw = map.date !== -1 && map.date < row.length ? (row[map.date] || '').trim() : '';
    
    // If there is no date, but we have an active transaction, this is likely a wrapped row
    if (!dateRaw) {
      if (currentTx && map.merchant !== -1 && map.merchant < row.length) {
        const extraText = cleanWhitespace(row[map.merchant] || '');
        if (extraText) {
          currentTx.merchantRaw += ' ' + extraText;
        }
      }
      if (currentTx && map.reference !== -1 && map.reference < row.length) {
        const extraRef = cleanWhitespace(row[map.reference] || '');
        if (extraRef) {
          currentTx.referenceRaw += ' ' + extraRef;
        }
      }
      continue;
    }

    // New transaction row detected
    if (currentTx) {
      transactions.push(currentTx);
    }

    const merchantRaw = map.merchant !== -1 && map.merchant < row.length ? cleanWhitespace(row[map.merchant] || '') : '';
    const referenceRaw = map.reference !== -1 && map.reference < row.length ? cleanWhitespace(row[map.reference] || '') : '';
    const balanceRaw = map.balance !== -1 && map.balance < row.length ? cleanWhitespace(row[map.balance] || '') : '';

    let amountRaw = '';
    
    if (map.amount !== -1 && map.amount < row.length && row[map.amount]) {
      amountRaw = row[map.amount].trim();
    } else if (map.debit !== -1 && map.debit < row.length && row[map.debit] && row[map.debit].trim() !== '') {
      amountRaw = row[map.debit].trim();
    } else if (map.credit !== -1 && map.credit < row.length && row[map.credit] && row[map.credit].trim() !== '') {
      let cr = row[map.credit].trim();
      if (!cr.startsWith('+') && !cr.startsWith('-')) {
         cr = '+' + cr;
      }
      amountRaw = cr;
    }

    currentTx = {
      dateRaw,
      merchantRaw,
      referenceRaw,
      amountRaw,
      balanceRaw
    };
  }

  if (currentTx) {
    transactions.push(currentTx);
  }

  console.log(`[Bank Statement Parser] Successfully extracted ${transactions.length} raw transactions.`);
  if (transactions.length > 0) {
    console.log('[Bank Statement Parser] First transaction sample:', JSON.stringify(transactions[0], null, 2));
  }

  return transactions;
}

export function parseTextLines(lines: string[]): RawBankTransaction[] {
  const transactions: RawBankTransaction[] = [];
  let currentTx: RawBankTransaction | null = null;
  
  // Date regex: 02/01/2026, 02-Jan-26, 02 Jan 2026, 02-Jan-2026
  const dateRegex = /^(\d{2}[-/\s](?:[a-zA-Z]{3}|\d{2})[-/\s]\d{2,4})/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const dateMatch = trimmed.match(dateRegex);
    if (dateMatch) {
      if (currentTx && currentTx.amountRaw) {
        transactions.push(currentTx);
      }
      
      const dateRaw = dateMatch[1];
      const rest = trimmed.substring(dateRaw.length).trim();
      
      // Extract trailing amounts: "1,000.00   25,000.00" or "450.00 Cr"
      const numbersMatch = rest.match(/((?:[\d,]+\.\d{2}(?:\s*(?:Cr|Dr|CR|DR))?\s*)+)$/i);
      
      let amountRaw = '';
      let balanceRaw = '';
      let merchantRaw = rest;
      
      if (numbersMatch) {
        const numsStr = numbersMatch[1];
        merchantRaw = rest.substring(0, rest.length - numsStr.length).trim();
        
        // split by whitespace, but keep negative signs and cr/dr attached to the preceding number if possible? 
        // We'll just split by simple spaces.
        const nums = numsStr.trim().split(/\s+(?=(?:\d|,|\.))/); 
        if (nums.length >= 1) {
          balanceRaw = nums[nums.length - 1];
          if (nums.length >= 2) {
             // If there's 2 or more amounts at the end, the first is usually debit/credit amount, last is balance
             amountRaw = nums[0];
          } else {
             amountRaw = nums[0];
          }
        }
      }
      
      currentTx = {
        dateRaw,
        merchantRaw,
        referenceRaw: '',
        amountRaw,
        balanceRaw
      };
    } else {
      // Multiline narration
      if (currentTx) {
        // Exclude common header/footer lines that get interleaved
        if (
          !trimmed.toLowerCase().includes('page ') && 
          !trimmed.toLowerCase().includes('balance') &&
          !trimmed.toLowerCase().includes('statement')
        ) {
          currentTx.merchantRaw += ' ' + trimmed;
        }
      }
    }
  }
  
  if (currentTx && currentTx.amountRaw) {
    transactions.push(currentTx);
  }

  console.log(`[Bank Statement Parser] Successfully extracted ${transactions.length} raw transactions via Text Lines parser.`);
  if (transactions.length > 0) {
    console.log('[Bank Statement Parser] First transaction sample:', JSON.stringify(transactions[0], null, 2));
  }

  return transactions;
}

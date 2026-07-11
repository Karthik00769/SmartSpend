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

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip empty or significantly short rows
    if (row.length < 2) continue;

    const dateRaw = map.date !== -1 ? (row[map.date] || '').trim() : '';
    
    // If there is no date at all, we don't treat it as a primary transaction line
    if (!dateRaw) continue;

    const merchantRaw = map.merchant !== -1 ? cleanWhitespace(row[map.merchant] || '') : '';
    const referenceRaw = map.reference !== -1 ? cleanWhitespace(row[map.reference] || '') : '';
    const balanceRaw = map.balance !== -1 ? cleanWhitespace(row[map.balance] || '') : '';

    let amountRaw = '';
    
    // Attempt to determine the amount purely based on mapped columns
    // DO NOT convert to float here. Just extract the string.
    if (map.amount !== -1 && row[map.amount]) {
      amountRaw = row[map.amount].trim();
    } else if (map.debit !== -1 && row[map.debit] && row[map.debit].trim() !== '') {
      // In many statements, a debit has a value, while credit is empty
      amountRaw = row[map.debit].trim();
    } else if (map.credit !== -1 && row[map.credit] && row[map.credit].trim() !== '') {
      // Credits usually need to be preserved for FinanceCore to parse the sign, 
      // but the extraction layer just treats it as a raw string.
      // Often, FinanceCore looks at the presence of a negative sign. 
      // We will append a '+' to explicitly denote it was in the credit column if there's no sign.
      let cr = row[map.credit].trim();
      if (!cr.startsWith('+') && !cr.startsWith('-')) {
         cr = '+' + cr;
      }
      amountRaw = cr;
    }

    transactions.push({
      dateRaw,
      merchantRaw,
      referenceRaw,
      amountRaw,
      balanceRaw
    });
  }

  return transactions;
}

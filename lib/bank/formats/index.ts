import { HEADER_ALIASES, HEADER_ROW_PATTERNS } from '../constants';

export interface ColumnMap {
  date: number;
  merchant: number;
  reference: number;
  debit: number;
  credit: number;
  amount: number;
  balance: number;
}

export function detectHeaderRow(rows: string[][]): { headerIdx: number; map: ColumnMap } {
  const map: ColumnMap = { date: -1, merchant: -1, reference: -1, debit: -1, credit: -1, amount: -1, balance: -1 };
  
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    const rowStr = row.join(' ').toLowerCase();

    // Check if it matches a known header pattern
    let isHeader = false;
    for (const pattern of HEADER_ROW_PATTERNS) {
      if (pattern.test(rowStr)) {
        isHeader = true;
        break;
      }
    }

    if (isHeader) {
      // Find columns dynamically
      map.date = findColumn(row, HEADER_ALIASES.DATE);
      map.merchant = findColumn(row, HEADER_ALIASES.MERCHANT);
      map.reference = findColumn(row, HEADER_ALIASES.REFERENCE);
      map.debit = findColumn(row, HEADER_ALIASES.DEBIT);
      map.credit = findColumn(row, HEADER_ALIASES.CREDIT);
      map.amount = findColumn(row, HEADER_ALIASES.AMOUNT);
      map.balance = findColumn(row, HEADER_ALIASES.BALANCE);
      
      return { headerIdx: i, map };
    }
  }

  return { headerIdx: -1, map };
}

function findColumn(row: string[], aliases: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const cell = row[i].toLowerCase().trim();
    if (aliases.some(alias => cell.includes(alias.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

import { RawBankTransaction } from './types';
import * as FinanceCore from '../finance';
import { processExpense } from '../expense-engine';
import { query } from '../db';

export interface BankImportResult {
  importedCount: number;
  skippedCount: number;
  skippedRows: {
    raw: RawBankTransaction;
    reason: string;
  }[];
}

/**
 * importBankTransactions
 * Adapter for Expense Engine integration.
 * Flow: RawBankTransaction -> FinanceCore Parsing -> FinanceCore Validation -> Expense Engine -> Database
 */
export async function importBankTransactions(
  transactions: RawBankTransaction[],
  userId: string
): Promise<BankImportResult> {
  const result: BankImportResult = {
    importedCount: 0,
    skippedCount: 0,
    skippedRows: []
  };

  if (transactions.length === 0) return result;

  // Pre-fetch all existing expenses to deduplicate by hash: "YYYY-MM-DD|amountMinor|description"
  const existingExpenses = await query<any[]>(
    `SELECT DATE_FORMAT(expense_date, '%Y-%m-%d') as expense_date, amount_minor, description 
     FROM expenses 
     WHERE user_id = ? AND deleted_at IS NULL`,
    [userId]
  );
  
  const safeExisting = Array.isArray(existingExpenses) ? existingExpenses : [];
  const existingHashes = new Set(
    safeExisting.map(e => `${e.expense_date}|${Number(e.amount_minor)}|${(e.description || '').trim()}`)
  );

  const CHUNK_SIZE = 10;
  for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
    const chunk = transactions.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(chunk.map(async (raw) => {
      try {
        // 1. FinanceCore Parsing
        const amountInr = FinanceCore.Parsing.extractAmount(raw.amountRaw);
        const dateStr = FinanceCore.Parsing.extractDate(raw.dateRaw);
        const merchantStr = FinanceCore.Parsing.sanitizeMerchantName(raw.merchantRaw);

        if (!dateStr) {
          result.skippedCount++;
          result.skippedRows.push({ raw, reason: 'Invalid or missing date' });
          return;
        }

        // Convert to Minor
        const amountMinor = FinanceCore.Math.inrToMinor(amountInr);

        // Filter out Credits/Income (SmartSpend only tracks expenses)
        if (amountMinor <= 0) {
          result.skippedCount++;
          result.skippedRows.push({ raw, reason: 'Credit/Income transaction skipped' });
          return;
        }

        const finalDescription = raw.referenceRaw || merchantStr;

        // Deduplication Check
        const hash = `${dateStr}|${amountMinor}|${finalDescription.trim()}`;
        if (existingHashes.has(hash)) {
          result.skippedCount++;
          result.skippedRows.push({ raw, reason: 'Duplicate transaction (already exists)' });
          return;
        }

        const validationInput = {
          userId,
          categoryId: 1, // Fallback
          amountMinor,
          date: dateStr,
          merchantName: merchantStr,
          description: finalDescription
        };

        const validation = FinanceCore.Validation.CreateExpenseInputSchema.safeParse(validationInput);

        if (!validation.success) {
          result.skippedCount++;
          result.skippedRows.push({ 
            raw, 
            reason: validation.error.errors.map(e => e.message).join(', ') 
          });
          return;
        }

        const engineResult = await processExpense({
          userId,
          categoryId: undefined,
          amountMinor: amountMinor,
          date: dateStr,
          description: finalDescription,
          source: 'bank_import'
        }, userId);

        if (engineResult.validation.valid) {
          result.importedCount++;
          existingHashes.add(hash); // Prevent duplicates within the same upload
        } else {
          result.skippedCount++;
          result.skippedRows.push({
            raw,
            reason: engineResult.validation.errors.map(e => e.message).join(', ')
          });
        }
      } catch (err: any) {
        result.skippedCount++;
        result.skippedRows.push({ raw, reason: err.message || 'Unknown processing error' });
      }
    }));
  }

  return result;
}

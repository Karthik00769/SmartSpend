import { RawBankTransaction } from './types';
import * as FinanceCore from '../finance';
import { processExpense } from '../expense-engine';

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

        // Convert to Paise
        const amountPaise = FinanceCore.Math.inrToPaise(amountInr);

        const validationInput = {
          userId,
          categoryId: 1, // Fallback
          amountPaise,
          date: dateStr,
          merchantName: merchantStr,
          description: raw.referenceRaw || merchantStr
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
          amountPaise: amountPaise,
          date: dateStr,
          description: raw.referenceRaw || merchantStr,
          source: 'bank_import'
        }, userId);

        if (engineResult.validation.valid) {
          result.importedCount++;
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

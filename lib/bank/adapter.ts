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

  for (const raw of transactions) {
    try {
      // 1. FinanceCore Parsing
      const amountInr = FinanceCore.Parsing.extractAmount(raw.amountRaw);
      const dateStr = FinanceCore.Parsing.extractDate(raw.dateRaw);
      const merchantStr = FinanceCore.Parsing.sanitizeMerchantName(raw.merchantRaw);

      if (!dateStr) {
        result.skippedCount++;
        result.skippedRows.push({ raw, reason: 'Invalid or missing date' });
        continue;
      }

      // Convert to Paise
      const amountPaise = FinanceCore.Math.inrToPaise(amountInr);

      // 2. FinanceCore Validation
      // Use CanonicalExpenseSchema constraints indirectly by using CreateExpenseInputSchema
      // We pass categoryId: 1 as a fallback for validation, Expense Engine categorizer will overwrite this if needed.
      const validationInput = {
        userId,
        categoryId: 1, // Fallback, ExpenseEngine auto-categorizes if source='bank_import'
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
        continue;
      }

      // 3. Expense Engine Processing (Includes DB insert)
      // The API endpoint passed 'amount' as the float value. The Expense Engine converts to paise internally?
      // Wait, let's pass amountInr because legacy ExpenseEngine validates `amount` as float before parsing to paise.
      
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
  }

  return result;
}

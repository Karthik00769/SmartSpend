/**
 * lib/ocr/adapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OCR Adapter — owns orchestration from raw OCR output to ExpenseEngine.
 *
 * Pipeline:
 *   RawReceipt[]
 *     → FinanceCore.Parsing.extractAmount()   (INR float from string)
 *     → FinanceCore.Parsing.extractDate()     (YYYY-MM-DD from string)
 *     → FinanceCore.Math.inrToPaise()         (Paise integer)
 *     → FinanceCore.Receipts.isDuplicate()    (skip if seen)
 *     → ExpenseEngine.processExpense()        (validate + persist)
 *
 * The adapter owns:
 *   - Parsing delegation (all done via FinanceCore)
 *   - Per-row error isolation (bad rows skipped, batch never aborted)
 *   - Duplicate suppression
 *   - Import summary production
 *
 * The adapter NEVER:
 *   - Calls OCR APIs
 *   - Writes to DB directly
 *   - Performs financial math
 *   - Assigns categories
 */

import { Parsing, Math as FinanceMath, Receipts } from '@/lib/finance';
import type { NormalizedReceipt } from '@/lib/finance/calculations/receipts';
import { processExpense } from '@/lib/expense-engine';
import type { RawReceipt } from './types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface OCRImportOptions {
  /** UserId to associate imported expenses with */
  userId: string;
  /**
   * Previously imported receipts for duplicate detection.
   * Caller is responsible for supplying this list.
   */
  existingReceipts?: NormalizedReceipt[];
  /** Paise tolerance for duplicate amount matching (default: 0 = exact) */
  amountTolerancePaise?: number;
  /** Day window for duplicate date matching (default: 0 = same day) */
  dateDeltaDays?: number;
}

export interface OCRImportRowError {
  rowIndex: number;
  merchantRaw: string;
  amountRaw: string;
  dateRaw: string;
  reason: string;
}

export interface OCRImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  errors: OCRImportRowError[];
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * importReceiptRows
 *
 * Takes an array of RawReceipt objects (from the OCR layer) and imports them
 * through FinanceCore and the Expense Engine.
 *
 * Bad rows are isolated — they do not abort the batch.
 */
export async function importReceiptRows(
  rows:    RawReceipt[],
  options: OCRImportOptions,
): Promise<OCRImportResult> {
  const {
    userId,
    existingReceipts       = [],
    amountTolerancePaise   = 0,
    dateDeltaDays          = 0,
  } = options;

  const result: OCRImportResult = {
    imported:   0,
    skipped:    0,
    duplicates: 0,
    errors:     [],
  };

  // Accumulate newly imported receipts for intra-batch duplicate detection
  const seenThisBatch: NormalizedReceipt[] = [...existingReceipts];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      // ── 1. Parse amount via FinanceCore ───────────────────────────────────
      const amountInr = Parsing.extractAmount(row.amountRaw);
      if (amountInr <= 0) {
        result.skipped++;
        result.errors.push({
          rowIndex:    i,
          merchantRaw: row.merchantRaw,
          amountRaw:   row.amountRaw,
          dateRaw:     row.dateRaw,
          reason:      `Invalid amount: "${row.amountRaw}" → ${amountInr}`,
        });
        continue;
      }

      // ── 2. Parse date via FinanceCore ─────────────────────────────────────
      const dateISO = Parsing.extractDate(row.dateRaw);
      if (!dateISO) {
        result.skipped++;
        result.errors.push({
          rowIndex:    i,
          merchantRaw: row.merchantRaw,
          amountRaw:   row.amountRaw,
          dateRaw:     row.dateRaw,
          reason:      `Could not parse date: "${row.dateRaw}"`,
        });
        continue;
      }

      // ── 3. Convert to Paise via FinanceCore ───────────────────────────────
      const amountPaise = FinanceMath.inrToPaise(amountInr);

      // ── 4. Sanitize merchant via FinanceCore ──────────────────────────────
      const merchant = Parsing.sanitizeMerchantName(row.merchantRaw);

      // ── 5. Duplicate detection via FinanceCore.Receipts ───────────────────
      const candidate: NormalizedReceipt = { merchant, amountPaise, date: dateISO };
      if (Receipts.isDuplicate(candidate, seenThisBatch, { amountTolerancePaise, dateDeltaDays })) {
        result.duplicates++;
        result.skipped++;
        continue;
      }

      // ── 6. Pass through ExpenseEngine (validate + persist) ────────────────
      await processExpense(
        {
          amount:      amountInr,       // ExpenseEngine validator expects INR float input
          date:        dateISO,
          description: merchant,
          source:      'receipt_scan' as const,
        },
        userId,
      );

      // ── 7. Record as seen for intra-batch duplicate detection ─────────────
      seenThisBatch.push(candidate);
      result.imported++;

    } catch (err: any) {
      // Per-row isolation: log but never abort the batch
      result.skipped++;
      result.errors.push({
        rowIndex:    i,
        merchantRaw: row.merchantRaw,
        amountRaw:   row.amountRaw,
        dateRaw:     row.dateRaw,
        reason:      err?.message ?? 'Unknown error',
      });
    }
  }

  return result;
}

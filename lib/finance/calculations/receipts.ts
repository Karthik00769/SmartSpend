/**
 * lib/finance/calculations/receipts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FinanceCore.Receipts — owns all receipt-specific financial logic.
 *
 * Responsibilities:
 *  - Duplicate receipt detection
 *  - Amount tolerance comparison
 */

/**
 * A normalized receipt record used for duplicate detection.
 */
export interface NormalizedReceipt {
  /** Merchant name, already sanitized */
  merchant: string;
  /** Amount in Paise (integer) */
  amountPaise: number;
  /** ISO date string YYYY-MM-DD */
  date: string;
}

/**
 * detectDuplicates
 *
 * Compares an incoming receipt against a list of existing receipts already
 * stored for the user. Returns the indices of any candidates that are likely
 * duplicates according to the configured tolerance windows.
 *
 * Duplicate criteria (ALL three must match within tolerance):
 *   1. Merchant name matches (case-insensitive, trimmed)
 *   2. Amount is within `amountTolerancePaise` (default 0 — exact match)
 *   3. Date is within `dateDeltaDays` (default 0 — same day)
 *
 * @param incoming   The receipt to check
 * @param existing   Previously imported receipts for the same user
 * @param options    Tolerance configuration
 * @returns          Indices into `existing` that are likely duplicates
 */
export function detectDuplicates(
  incoming:  NormalizedReceipt,
  existing:  NormalizedReceipt[],
  options: {
    amountTolerancePaise?: number;
    dateDeltaDays?: number;
  } = {},
): number[] {
  const { amountTolerancePaise = 0, dateDeltaDays = 0 } = options;

  const incomingMerchant = incoming.merchant.toLowerCase().trim();
  const incomingDate     = new Date(incoming.date).getTime();

  const duplicateIndices: number[] = [];

  for (let i = 0; i < existing.length; i++) {
    const candidate = existing[i];

    // 1. Merchant match
    const merchantMatch =
      candidate.merchant.toLowerCase().trim() === incomingMerchant;
    if (!merchantMatch) continue;

    // 2. Amount tolerance
    const amountDelta = Math.abs(candidate.amountPaise - incoming.amountPaise);
    if (amountDelta > amountTolerancePaise) continue;

    // 3. Date proximity
    const candidateDate = new Date(candidate.date).getTime();
    const msPerDay      = 86_400_000;
    const daysDelta     = Math.abs(candidateDate - incomingDate) / msPerDay;
    if (daysDelta > dateDeltaDays) continue;

    duplicateIndices.push(i);
  }

  return duplicateIndices;
}

/**
 * isDuplicate
 * Convenience wrapper — returns true if ANY duplicate is found.
 */
export function isDuplicate(
  incoming: NormalizedReceipt,
  existing: NormalizedReceipt[],
  options?: { amountTolerancePaise?: number; dateDeltaDays?: number },
): boolean {
  return detectDuplicates(incoming, existing, options).length > 0;
}

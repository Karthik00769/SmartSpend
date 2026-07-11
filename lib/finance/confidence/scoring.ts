/**
 * lib/finance/confidence/scoring.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Confidence scoring for automated data entry (OCR, Bank parsers).
 */

export interface ConfidenceObject {
  amount: number;      // 0-100
  date: number;        // 0-100
  merchant: number;    // 0-100
  overall: number;     // 0-100
  needsReview: boolean;
}

/**
 * Calculates the overall confidence score based on individual field scores.
 * Weighting: Amount (50%), Date (30%), Merchant (20%).
 */
export function calculateOverallConfidence(amountScore: number, dateScore: number, merchantScore: number): number {
  const weighted = (amountScore * 0.5) + (dateScore * 0.3) + (merchantScore * 0.2);
  return Math.round(weighted);
}

/**
 * Evaluates whether an extracted record requires manual human review.
 * Triggers if any vital field is < 50, or overall is < 80.
 */
export function requiresManualReview(conf: Omit<ConfidenceObject, 'needsReview' | 'overall'>): boolean {
  const overall = calculateOverallConfidence(conf.amount, conf.date, conf.merchant);
  if (overall < 80) return true;
  if (conf.amount < 50 || conf.date < 50 || conf.merchant < 50) return true;
  return false;
}

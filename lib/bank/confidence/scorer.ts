import { RawBankTransaction, BankConfidence } from '../types';

export function calculateStatementConfidence(transactions: RawBankTransaction[]): number {
  if (transactions.length === 0) return 0;
  
  let totalScore = 0;
  
  for (const txn of transactions) {
    totalScore += calculateTransactionConfidence(txn).overall;
  }
  
  return Math.round(totalScore / transactions.length);
}

export function calculateTransactionConfidence(txn: RawBankTransaction): BankConfidence {
  let score = {
    date: 0,
    amount: 0,
    merchant: 0,
    reference: 0,
    overall: 0
  };

  // Date confidence: is it non-empty and roughly looks like some date string?
  if (txn.dateRaw.length >= 5) score.date = 100;
  else if (txn.dateRaw.length > 0) score.date = 50;

  // Amount confidence: does it look like a number/currency string?
  const amtClean = txn.amountRaw.replace(/[$,+ -]/g, '');
  if (/^\\d+(\\.\\d{1,2})?$/.test(amtClean)) score.amount = 100;
  else if (txn.amountRaw.length > 0) score.amount = 50;

  // Merchant confidence: is it decently long?
  if (txn.merchantRaw.length >= 5) score.merchant = 100;
  else if (txn.merchantRaw.length > 0) score.merchant = 50;

  // Reference confidence (optional):
  if (txn.referenceRaw.length > 3) score.reference = 100;
  else score.reference = 100; // Not strictly required so we don't penalize heavily

  score.overall = Math.round(
    (score.date * 0.4) + 
    (score.amount * 0.4) + 
    (score.merchant * 0.2)
  );

  return score;
}

import { RawReceipt, OCRConfidence } from '../types';

/**
 * calculateConfidence
 * Computes a confidence score (0-100) for each extracted field based on raw string characteristics,
 * then returns an overall confidence score.
 */
export function calculateConfidence(parsed: RawReceipt): OCRConfidence {
  let amountScore = 0;
  if (parsed.amountRaw) {
    if (/^\\d+\\.\\d{2}$/.test(parsed.amountRaw)) {
      amountScore = 95; // perfect standard format
    } else if (/^\\d+$/.test(parsed.amountRaw)) {
      amountScore = 70; // likely a whole number amount
    } else if (/[A-Za-z]/.test(parsed.amountRaw)) {
      amountScore = 20; // Contains letters, low confidence
    } else {
      amountScore = 50;
    }
  }

  let dateScore = 0;
  if (parsed.dateRaw) {
    // If it looks like a standard date string it's fairly confident
    dateScore = parsed.dateRaw.length >= 6 ? 90 : 30;
  }

  let merchantScore = 0;
  if (parsed.merchantRaw) {
    if (parsed.merchantRaw.length > 5 && !/\\d/.test(parsed.merchantRaw)) {
      merchantScore = 90;
    } else if (parsed.merchantRaw.length > 2) {
      merchantScore = 60;
    }
  }

  // Calculate overall - weighted slightly towards amount
  let overall = 0;
  if (amountScore > 0 && dateScore > 0 && merchantScore > 0) {
    overall = Math.round((amountScore * 0.5) + (merchantScore * 0.3) + (dateScore * 0.2));
  } else if (amountScore > 0) {
    overall = amountScore - 20; // Penalty for missing other fields
  } else {
    overall = 10;
  }

  return {
    overall,
    amount: amountScore,
    merchant: merchantScore,
    date: dateScore,
    tax: 0,
    total: amountScore, // Fallback to amount score
  };
}

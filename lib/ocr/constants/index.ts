// Patterns for finding date-like strings (no parsing, just finding)
export const RECEIPT_DATE_PATTERNS = [
  /\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/,     // DD/MM/YYYY
  /\b(\d{4})[\/.-](\d{2})[\/.-](\d{2})\b/,     // YYYY-MM-DD
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i, // 15 Jan 2024
  /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})\b/, // D/M/YY
];

// Words that appear on receipt headers/footers but are NOT merchant names
export const SKIP_WORDS = new Set([
  'receipt', 'invoice', 'tax', 'total', 'amount', 'date', 'time', 'page',
  'order', 'duplicate', 'customer', 'cashier', 'terminal', 'auth', 'thank',
  'welcome', 'please', 'visit', 'gst', 'vat', 'subtotal', 'visa', 'mastercard',
  'amex', 'rupee', 'payment', 'bill', 'cash', 'change', 'balance', 'paid',
  'transaction', 'ref', 'upi', 'neft', 'imps', 'ifsc', 'account', 'bank',
  'number', 'phone', 'mobile', 'address', 'city', 'state', 'pin', 'email',
  'www', 'http', 'gstin', 'cin', 'pan', 'fssai', 'licence', 'license',
  'original', 'copy', 'print', 'approved', 'declined', 'debit', 'credit',
]);

export const TOTAL_LINE_PATTERN =
  /\b(grand\s*total|total\s*amount|amount\s*payable|net\s*payable|amount\s*paid|amount\s*due|net\s*amount|total\s*due|bill\s*amount|payable\s*amount|total\s*payable|net\s*bill|final\s*amount|total)\b/i;

export const FALSE_POSITIVE_PATTERN =
  /\b(cgst|sgst|igst|cess|tax|vat|service\s*tax|discount|round\s*off|rounding|tds|surcharge|tip|gratuity|item\s*total|qty|quantity|rate|mrp|unit\s*price|per\s*unit|each)\b/i;

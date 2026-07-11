export interface RawReceipt {
  merchantRaw: string;
  amountRaw: string;
  dateRaw: string;
  upiRaw: string;
  gstRaw: string;
  items: string[];
  taxRaw: string;
  totalRaw: string;
}

export interface OCRConfidence {
  overall: number;
  amount: number;
  merchant: number;
  date: number;
  tax: number;
  total: number;
}

export interface OCRResult {
  rawText: string;
  parsed: RawReceipt;
  confidence: OCRConfidence;
  needsReview: boolean;
}

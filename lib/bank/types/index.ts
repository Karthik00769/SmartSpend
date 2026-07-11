export interface RawBankTransaction {
  dateRaw: string;
  amountRaw: string;
  merchantRaw: string;
  referenceRaw: string;
  balanceRaw: string;
}

export interface BankConfidence {
  date: number;
  amount: number;
  merchant: number;
  reference: number;
  overall: number;
}

export interface StatementMetadata {
  bankName: string;
  statementPeriod: string;
  accountMasked: string;
  currency: string;
  confidence: number;
  transactions: RawBankTransaction[];
}

export interface BankStatementExtraction {
  metadata: StatementMetadata;
  needsReview: boolean;
  errors: string[];
}

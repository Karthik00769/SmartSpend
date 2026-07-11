export const BANK_IDENTIFIERS = {
  HDFC: ['HDFC', 'H.D.F.C', 'HOUSING DEVELOPMENT FINANCE CORPORATION'],
  ICICI: ['ICICI', 'I.C.I.C.I'],
  SBI: ['SBI', 'STATE BANK OF INDIA'],
  AXIS: ['AXIS', 'UTI BANK'],
};

// Known CSV/PDF Column headers (mapped dynamically during format detection)
export const HEADER_ALIASES = {
  DATE: ['Date', 'Value Date', 'Txn Date', 'Transaction Date', 'Date of Txn'],
  MERCHANT: ['Narration', 'Description', 'Remarks', 'Particulars', 'Transaction Details'],
  REFERENCE: ['Reference', 'Ref No.', 'Chq/Ref No.', 'Cheque Number', 'Ref No/Cheque No', 'Reference Number', 'UTR'],
  DEBIT: ['Withdrawal', 'Debit', 'Dr', 'Amount(Dr)'],
  CREDIT: ['Deposit', 'Credit', 'Cr', 'Amount(Cr)'],
  AMOUNT: ['Amount', 'Transaction Amount'], // when Debit/Credit are merged with a sign
  BALANCE: ['Balance', 'Closing Balance', 'Available Balance'],
};

// Patterns used to identify if a row is the header row
export const HEADER_ROW_PATTERNS = [
  /Date.*Narration.*Balance/i,
  /Date.*Description.*Withdrawal.*Deposit/i,
  /Txn Date.*Value Date.*Description/i,
  /Date.*Particulars.*Debit.*Credit/i,
  /Date.*Description.*Debit.*Credit/i, // Added to catch the mocked PDF
];

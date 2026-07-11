export class BankExtractionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BankExtractionError';
  }
}

export class UnsupportedBankFormatError extends BankExtractionError {
  constructor(message: string = 'The uploaded bank statement format is not supported.') {
    super(message, 'UNSUPPORTED_BANK_FORMAT');
  }
}

export class MalformedCSVError extends BankExtractionError {
  constructor(message: string = 'The CSV structure is malformed and could not be parsed.') {
    super(message, 'MALFORMED_CSV');
  }
}

export class EncryptedPDFError extends BankExtractionError {
  constructor(message: string = 'The PDF is encrypted. A password is required.') {
    super(message, 'ENCRYPTED_PDF');
  }
}

export class UnreadableAmountError extends BankExtractionError {
  constructor(message: string = 'Could not reliably extract amounts from this statement.') {
    super(message, 'UNREADABLE_AMOUNT');
  }
}

export class MissingDateError extends BankExtractionError {
  constructor(message: string = 'Could not reliably extract transaction dates from this statement.') {
    super(message, 'MISSING_DATE');
  }
}

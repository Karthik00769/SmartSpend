export function cleanWhitespace(str: string): string {
  return str.replace(/\\s{2,}/g, ' ').trim();
}

export function extractBankName(header: string): string {
  const upper = header.toUpperCase();
  if (upper.includes('HDFC') || upper.includes('H.D.F.C')) return 'HDFC';
  if (upper.includes('ICICI') || upper.includes('I.C.I.C.I')) return 'ICICI';
  if (upper.includes('SBI') || upper.includes('STATE BANK')) return 'SBI';
  if (upper.includes('AXIS') || upper.includes('UTI BANK')) return 'AXIS';
  return 'UNKNOWN';
}

// Simple deterministic pattern to find an account number mask like XXXXXX1234
export function extractAccountMask(text: string): string {
  const match = text.match(/[X*x]{4,}[0-9]{3,4}/);
  return match ? match[0] : '';
}

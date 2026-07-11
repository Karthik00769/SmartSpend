/**
 * cleanOCRText
 * Cleans OCR noise from raw tesseract output.
 * STEP 1 of the multi-stage pipeline.
 *
 *  - Removes garbage control characters
 *  - Normalises currency symbols (Rs, Rs., RS → Rs)
 *  - Fixes common OCR substitutions (O→0 in digit context, l→1 in digit context)
 *  - Collapses duplicate whitespace and blank lines
 */
export function cleanOCRText(raw: string): string {
  return raw
    // Remove control chars except newline/tab
    .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, ' ')
    // Normalize "Rs." / "RS." → "Rs"
    .replace(/\bR[Ss]\.?\s*/g, 'Rs ')
    // Fix OCR: "O" misread as "0" inside number sequences like "Rs O12.5O"
    .replace(/(?<=\d|\.)O(?=\d|\.|$|\s)/g, '0')
    .replace(/(?<=^|\s)O(?=\d|\.)/g, '0')
    // Fix OCR: lowercase "l" misread where a digit is expected (e.g. "l50" → "150")
    .replace(/(?<=\s|^)l(?=\d)/gm, '1')
    // Collapse runs of spaces (but NOT newlines)
    .replace(/ {2,}/g, ' ')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * isJunkLine
 * Returns true for lines that structurally cannot contain a receipt total.
 * Catches: phone numbers, GSTINs, date labels, invoice numbers, addresses,
 * emails, URLs, and pure decoration lines.
 */
export function isJunkLine(line: string): boolean {
  const trimmed = line.trim();

  if (trimmed.length < 2) return true;
  if (/^[-=*_.:|]{3,}$/.test(trimmed)) return true;
  if (/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/i.test(trimmed)) return true;

  const digitsOnly = trimmed.replace(/[\s().+-]/g, '');
  if (/\d{7,}/.test(digitsOnly)) return true;

  if (/^\s*(date|dt|time|invoice\s*(?:date|no|num|number|#)|bill\s*(?:date|no)|txn\s*date|trans\s*date)\s*[:.]?\s*/i.test(trimmed)) return true;
  if (/^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*$/.test(trimmed)) return true;
  if (/^\s*\d{4}[/-]\d{2}[/-]\d{2}\s*$/.test(trimmed)) return true;
  if (/^\s*(invoice|order|bill|receipt|txn|transaction|ref(?:erence)?|auth)\s*(no|num|number|#|id|code)?\s*[:.]?\s*[\w\-\/]+\s*$/i.test(trimmed)) return true;
  if (/\b(street|road|ave|avenue|nagar|colony|sector|plot|flat|floor|pincode|zip\s*code)\b/i.test(trimmed)) return true;
  if (/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(trimmed)) return true;
  if (new RegExp('https?://|www\\.\\w+', 'i').test(trimmed)) return true;
  if (/\b(CIN|PAN|FSSAI|L\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/.test(trimmed)) return true;

  return false;
}

// Placeholder for actual OCR engine integration (e.g. Tesseract.js, Google Cloud Vision)
// The key rule: It MUST only return a raw string. No parsing.

export async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
  // TODO: Replace with actual OCR invocation
  // For now, simulating extraction
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("MOCK RECEIPT TEXT\\nRs. 1500.00\\n15/05/2026\\nSTARBUCKS COFFEE");
    }, 500);
  });
}

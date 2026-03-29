/**
 * app/api/expenses/scan/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * POST /api/expenses/scan
 * Receives a receipt image file (multipart/form-data), runs OCR via Gemini,
 * and processes the extracted data through the expense engine.
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { scanReceipt } from '@/lib/ai/ocrEngine';
import { processExpense } from '@/lib/expense-engine';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return fail('No receipt image provided.', 400);
    }

    // 1. Convert to Base64 for Gemini
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.type;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(mimeType)) {
      return fail('Only Images (JPEG, PNG, WebP) and PDFs are supported for receipt scanning.', 400);
    }

    // 2. Scan with Gemini OCR
    const extracted = await scanReceipt(base64, mimeType);

    if (!extracted) {
      return fail('OCR failed to extract data from the receipt.', 422);
    }

    // 3. Process through standard engine pipeline
    const result = await processExpense(
      {
        userId,
        amount:      extracted.amount,
        date:        extracted.date,
        description: extracted.description,
      },
      userId,
    );

    if (!result.validation.valid) {
      return fail('Processed metadata validation failed.', 422, { ocr: ['Scanned data was inconsistent.'] });
    }

    return ok({
      expenseId: result.savedExpenseId,
      processed: result.processed,
      extracted,
    }, 201);

  } catch (err) {
    console.error('[POST /api/expenses/scan]', err);
    return fail('Failed to process receipt scan.', 500);
  }
}

import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import Tesseract from 'tesseract.js';
import { processExpense } from '@/lib/expense-engine';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return fail('No file uploaded', 400);
    }

    // 1. Convert File to Buffer for Tesseract
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('[OCR] Processing file:', file.name, file.size, 'bytes');

    // 2. Run Tesseract OCR
    const { data: { text } } = await Tesseract.recognize(
      buffer,
      'eng',
      {
        // Whitelist numbers and decimal items setup
        logger: m => console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`)
      }
    );

    console.log('[OCR] Extracted Text:', text);

    if (!text || text.trim().length < 5) {
      return fail('Could not extract legible text from receipt.', 422);
    }

    // 3. Simple Regex Extractor pipeline
    const cleanedText = text.replace(/[\r\n]+/g, '\n');
    const lines = cleanedText.split('\n').filter(l => l.trim().length > 0);

    // Merchant (First line or highest confidence line)
    const merchant = lines[0] ? lines[0].trim().replace(/[^a-zA-Z0-9\s]/g, '') : 'Unknown Merchant';

    // Amount lookup 
    let amount = 0;
    const amountRegex = /(?:total|amount|due|sum|net|pay|qty)\s*(?:[:=]?)\s*(?:\$|₹|€|£)?\s*(\d+[\.,]\d{2})/i;
    
    // Try matching specific line totals first
    for (const line of lines) {
      const match = line.match(amountRegex);
      if (match) {
        amount = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // Fallback: Find the largest number on the receipt
    if (amount === 0) {
      const numberMatches = cleanedText.match(/\d+[\.,]\d{2}/g);
      if (numberMatches) {
        const numbers = numberMatches.map(n => parseFloat(n.replace(',', '.')));
        amount = Math.max(...numbers);
      }
    }

    // Date lookup
    let date = new Date().toISOString().slice(0, 10); // fallback today
    const dateRegex = /(\d{2,4}[\/\.-]\d{2}[\/\.-]\d{2,4})/;
    const dateMatch = cleanedText.match(dateRegex);
    if (dateMatch) {
      try {
        const parsedDate = new Date(dateMatch[1]);
        if (!isNaN(parsedDate.getTime())) {
          date = parsedDate.toISOString().slice(0, 10);
        }
      } catch (e) {}
    }

    console.log('[OCR] Extracted Data Strategy:', { amount, merchant, date });

    // 4. Optionally run through ProcessExpense so it creates a DB row auto-categorized!
    // For now we will return the extracted state back to Frontend form so the user can Review & Submit!
    return ok({
      amount,
      merchant,
      date,
      description: `OCR Scan: ${merchant}`,
      rawText: text.substring(0, 200)
    });

  } catch (err: any) {
    console.error('[POST /api/expenses/upload]', err);
    return fail('Failed to perform OCR on image', 500);
  }
}

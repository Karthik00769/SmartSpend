/**
 * app/api/expenses/upload/route.ts
 * POST /api/expenses/upload
 *
 * Deterministic upload route relying on lib/ocr and lib/bank.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession }          from 'next-auth/next';
import { authOptions }               from '@/lib/auth/authOptions';
import { processReceiptImage }       from '@/lib/ocr';
import { processBankStatement }      from '@/lib/bank';
import * as FinanceCore              from '@/lib/finance';
import { checkRateLimit }            from '@/lib/security/rate-limit';
import { classifyDocumentImage, classifyDocumentText, DocumentClassification } from '@/lib/document/classifier';
import { extractPDFLines } from '@/lib/bank/extractor/pdf';
import { extractTextFromPDFOCR } from '@/lib/ocr/pdf-fallback';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES   = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE    = 'application/pdf';
const TEXT_TYPES  = new Set(['text/csv', 'text/plain', 'text/tab-separated-values']);
const EXCEL_TYPES = new Set(['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown-ip';
  if (!checkRateLimit(ip, 20, 60 * 1000)) { // 20 uploads per minute
    return NextResponse.json({ ok: false, error: 'Rate limit exceeded.' }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const password = formData.get('password') as string | null;

    if (!file) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ ok: false, error: 'The file is empty.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File too large (max 10 MB).' }, { status: 413 });

    const ext      = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const mimeType = file.type.toLowerCase();
    const isImage  = IMAGE_TYPES.has(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const isPDF    = mimeType === PDF_TYPE || ext === '.pdf';
    const isText   = TEXT_TYPES.has(mimeType) || ['.csv', '.txt', '.tsv'].includes(ext);
    const isExcel  = EXCEL_TYPES.has(mimeType) || ['.xls', '.xlsx'].includes(ext);

    if (!isImage && !isPDF && !isText && !isExcel) {
      return NextResponse.json({ ok: false, error: 'Unsupported file type.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let docType: DocumentClassification = 'Unknown';
    let textContent = '';
    let preParsedLines: string[] | undefined = undefined;

    // Classification Stage
    if (isImage) {
      docType = await classifyDocumentImage(buffer, mimeType);
    } else if (isPDF) {
      try {
        preParsedLines = await extractPDFLines(buffer, password || undefined);
        textContent = preParsedLines.join('\n');
      } catch (err: any) {
        if (err.name === 'BankExtractionError' || err.code === 'ENCRYPTED_PDF') {
          throw err;
        }
        console.warn('[UPLOAD] pdf-parse failed, attempting OCR fallback', err);
        preParsedLines = await extractTextFromPDFOCR(buffer, password || undefined);
        textContent = preParsedLines.join('\n');
      }
      docType = classifyDocumentText(textContent);
    } else if (isText || isExcel) {
      docType = 'Bank Statement';
      textContent = isText ? buffer.toString('utf8') : '';
    }

    console.log(`[DOC TYPE] ${docType}`);
    console.log(`[EXTRACTED TEXT LENGTH] ${textContent.length}`);

    // Allow user to manually fallback instead of failing
    if (docType === 'Unknown') {
      console.warn('[UPLOAD] Document type unknown. Defaulting to single-expense extraction.');
      docType = 'Invoice';
    }

    // Routing based on classification
    if (docType === 'Bank Statement') {
      const fileType = isExcel ? 'excel' : isPDF ? 'pdf' : 'csv';
      const bankResult = await processBankStatement(buffer, textContent, {
        fileType,
        fileName: file.name,
        password: password || undefined,
        preParsedLines
      });

      // 0-Transaction Fallback Logic
      if (bankResult.metadata.transactions.length === 0) {
        console.log('[UPLOAD] 0 transactions found in Bank Statement flow. Attempting fallback to Invoice/Receipt flow.');
        
        // If we have an image or PDF, process it directly with OCR
        if (isImage || isPDF) {
          const fallbackMime = isPDF ? 'application/pdf' : mimeType;
          return await processSingleExpenseRoute(buffer, fallbackMime);
        } else {
          return NextResponse.json({ ok: false, error: 'No transactions found and format unsupported for single expense fallback.' }, { status: 400 });
        }
      }
      
      const { importBankTransactions } = await import('@/lib/bank');
      const importResult = await importBankTransactions(bankResult.metadata.transactions, (session.user as any).id as string);
      
      console.log(`[CREATED EXPENSES COUNT] ${importResult.importedCount}`);
      
      return NextResponse.json({
        ok: true,
        data: {
          importedCount: importResult.importedCount,
          skippedCount: importResult.skippedCount,
          skippedRows: importResult.skippedRows,
          source: 'bank',
          parseMode: fileType,
        },
      });
    } else {
      // It's a Receipt, Invoice, or Payment Acknowledgement
      // Treat as Single Expense
      const singleMimeType = isPDF ? 'application/pdf' : mimeType;
      return await processSingleExpenseRoute(buffer, singleMimeType);
    }

  } catch (err: any) {
    console.error('[UPLOAD] Unexpected error:', err);
    if (err.name === 'BankExtractionError' || err.code === 'ENCRYPTED_PDF') {
      return NextResponse.json({ ok: false, error: err.message, code: err.code || 'EXTRACTION_ERROR' }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'An unexpected processing error occurred.' }, { status: 500 });
  }
}

async function processSingleExpenseRoute(buffer: Buffer, mimeType: string) {
  const ocrResult = await processReceiptImage(buffer, mimeType);
  
  let amount = 0;
  let merchant = '';
  let date = new Date().toISOString().slice(0, 10);
  let dateAdjusted = false;
  let description = '';

  if (ocrResult.source === 'gemini' && ocrResult.extracted) {
    console.log('[OCR NORMALIZED] Using Gemini extracted structure');
    amount = ocrResult.extracted.amount;
    merchant = ocrResult.extracted.merchant;
    date = ocrResult.extracted.date;
    description = ocrResult.extracted.description || merchant;
    dateAdjusted = false;
  } else {
    console.log('[OCR NORMALIZED] Using Tesseract raw structure');
    amount = FinanceCore.Parsing.extractAmount(ocrResult.parsed?.amountRaw ?? '');
    merchant = FinanceCore.Parsing.sanitizeMerchantName(ocrResult.parsed?.merchantRaw || '');
    date = FinanceCore.Parsing.extractDate(ocrResult.parsed?.dateRaw ?? '') ?? new Date().toISOString().slice(0, 10);
    description = merchant;
    dateAdjusted = !ocrResult.parsed?.dateRaw;
  }
  
  const dto = {
    merchant,
    amount,
    date,
    currency: 'INR',
    description
  };
  
  console.log(`[EXPENSE DTO] ${JSON.stringify(dto, null, 2)}`);
  
  const createdCount = amount > 0 ? 1 : 0;
  console.log(`[EXPENSE CREATED] ${createdCount}`);

  const amountWarning = amount === 0 
      ? 'Could not detect a valid amount — please enter it manually.' 
      : ocrResult.needsReview ? 'Amount detected but confidence is low — verify before saving.' : null;

  return NextResponse.json({
    ok: true,
    data: {
      extracted: {
        ...dto,
        dateAdjusted,
      },
      source: ocrResult.source || 'ocr',
      confidence: ocrResult.confidence || 0,
      needsReview: ocrResult.needsReview,
      amountWarning,
    },
  });
}

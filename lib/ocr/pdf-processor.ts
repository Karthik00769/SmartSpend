/**
 * lib/ocr/pdf-processor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF pipeline for the upload route.
 *
 * Two modes:
 *  A) DIGITAL PDF  — has an embedded text layer  (text.length >= 200 chars)
 *     → extract text via pdf-parse, return directly
 *
 *  B) SCANNED PDF  — image-based pages, no text layer
 *     → render each page to a PNG buffer via pdfjs-dist (pure JS, no system deps)
 *     → run the same Sharp + Tesseract OCR pipeline as the image upload path
 *     → merge all page texts and return
 *
 * IMPORTANT: This module must NOT import anything from Next.js or the app layer.
 * It is a pure utility used by the upload API route.
 */

import path        from 'node:path';
import { pathToFileURL } from 'node:url';
import { cleanOCRText }  from './receipt-parser';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
const pdfParse = require('pdf-parse');
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// In Next.js server environment, setting workerSrc with require.resolve 
// breaks build because it's transformed into a module ID.
// We assign a primitive string to avoid "Invalid workerSrc type" error.
if (pdfjsLib?.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
}

const NM = path.join(process.cwd(), 'node_modules');
const TESSERACT_WORKER = path.join(NM, 'tesseract.js/src/worker-script/node/index.js');

// ─── Threshold: >= this many chars → "digital" PDF (has real text layer) ─────
const DIGITAL_TEXT_THRESHOLD = 200;

// ─── Maximum pages to OCR for a scanned PDF (keep it fast) ───────────────────
const MAX_PAGES_OCR = 5;

// ─── PDF page render size (px) — higher = better OCR, slower ─────────────────
const PAGE_RENDER_SCALE = 2.0; // 2× gives ~150 dpi range for typical PDFs

// ─── Result type ─────────────────────────────────────────────────────────────

export interface PDFExtractResult {
  text:       string;    // full extracted / OCR'd text (may be multi-page merged)
  isDigital:  boolean;   // true if text came from text layer; false if OCR'd
  pageCount:  number;    // total pages in PDF
  pagesOCRd:  number;    // how many pages were OCR'd (0 for digital)
  warning?:   string;    // set if partial extraction occurred
}

// ─── Shared image OCR (same passes as the scan/upload route) ─────────────────

async function ocrBuffer(buffer: Buffer): Promise<string> {
  const workerPath = pathToFileURL(TESSERACT_WORKER).href;

  const passes = [
    {
      name: 'gentle',
      fn: () => (sharp as any)(buffer).grayscale().normalize().sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 }).png({ compressionLevel: 1 }).toBuffer() as Promise<Buffer>,
    },
    {
      name: 'contrast-boost',
      fn: () => (sharp as any)(buffer).grayscale().normalize().linear(1.6, -(128 * 0.6)).sharpen({ sigma: 1.5 }).png({ compressionLevel: 1 }).toBuffer() as Promise<Buffer>,
    },
    {
      name: 'threshold',
      fn: () => (sharp as any)(buffer).grayscale().normalize().threshold(145).png({ compressionLevel: 1 }).toBuffer() as Promise<Buffer>,
    },
  ];

  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath,
  });
  await worker.setParameters({ 
    tessedit_pageseg_mode: '6' as any,
    preserve_interword_spaces: '1',
  });

  let bestText = '';
  let bestConf = 0;

  for (const p of passes) {
    try {
      const prep  = await p.fn();
      const { data: { text, confidence } } = await worker.recognize(prep);
      const cleaned = cleanOCRText(text);
      const tLen  = cleaned.trim().length;
      const conf  = confidence ?? 0;
      console.log(`[PDF-OCR/${p.name}] conf=${conf.toFixed(0)} chars=${tLen}`);

      if (tLen > bestText.trim().length * 1.15 || (conf > bestConf + 10 && tLen > 20)) {
        bestText = cleaned;
        bestConf = conf;
      }
      if (bestConf >= 80 && bestText.trim().length > 100) break;
    } catch (e: any) {
      console.warn(`[PDF-OCR/${p.name}] skip:`, e?.message);
    }
  }

  await worker.terminate();
  return bestText;
}

// ─── Render one PDF page to a PNG buffer via pdfjs-dist ──────────────────────

async function renderPageToBuffer(pdfDoc: any, pageNum: number): Promise<Buffer> {
  const page     = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE });

  const width  = Math.round(viewport.width);
  const height = Math.round(viewport.height);

  // pdfjs-dist needs a canvas-like context. We use a raw RGBA pixel buffer
  // and a minimal "fake canvas" object that matches the NodeCanvasFactory interface.
  const rawData = new Uint8ClampedArray(width * height * 4);

  // NodeCanvasFactory interface required by pdfjs-dist
  const canvasAndCtx = {
    canvas: {
      width,
      height,
      getContext: () => ({
        // ── Minimal Canvas 2D context stub ──────────────────────────────────
        canvas: { width, height },
        _pixels: rawData,

        // pdfjs calls these to set transform / draw — we only care about drawImage
        // For our purposes we implement a "good enough" stub that lets pdfjs render
        // text operators and returns the raw pixel data.
        save:     () => {},
        restore:  () => {},
        scale:    () => {},
        rotate:   () => {},
        translate: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        clearRect: () => {},
        fillRect: (x: number, y: number, w: number, h: number) => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        clip: () => {},
        arc: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        rect: () => {},
        measureText: (t: string) => ({ width: t.length * 8 }),
        fillText:  () => {},
        strokeText: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        drawImage: () => {},
        getImageData: (x: number, y: number, w: number, h: number) => ({
          data: rawData, width: w, height: h,
        }),
        putImageData: () => {},
        createImageData: (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4), width: w, height: h,
        }),
        get fillStyle() { return '#000'; },
        set fillStyle(_) {},
        get strokeStyle() { return '#000'; },
        set strokeStyle(_) {},
        get lineWidth() { return 1; },
        set lineWidth(_) {},
        get font() { return '12px sans-serif'; },
        set font(_) {},
        get globalAlpha() { return 1; },
        set globalAlpha(_) {},
        get globalCompositeOperation() { return 'source-over'; },
        set globalCompositeOperation(_) {},
        get shadowBlur() { return 0; },
        set shadowBlur(_) {},
        get shadowColor() { return 'transparent'; },
        set shadowColor(_) {},
        get shadowOffsetX() { return 0; },
        set shadowOffsetX(_) {},
        get shadowOffsetY() { return 0; },
        set shadowOffsetY(_) {},
        get lineCap() { return 'butt'; },
        set lineCap(_) {},
        get lineJoin() { return 'miter'; },
        set lineJoin(_) {},
        get miterLimit() { return 10; },
        set miterLimit(_) {},
        get textAlign() { return 'start'; },
        set textAlign(_) {},
        get textBaseline() { return 'alphabetic'; },
        set textBaseline(_) {},
        get direction() { return 'ltr'; },
        set direction(_) {},
        isPointInPath: () => false,
        isPointInStroke: () => false,
        setLineDash: () => {},
        getLineDash: () => [],
      }),
    },
  };

  const renderContext = {
    canvasContext: canvasAndCtx.canvas.getContext(),
    viewport,
  };

  await page.render(renderContext).promise;
  page.cleanup();

  // Convert raw RGBA to PNG using sharp
  const pngBuffer = await sharp(Buffer.from(rawData.buffer), {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();

  return pngBuffer;
}

// ─── Main export: processPDF ──────────────────────────────────────────────────

/**
 * processPDF
 *
 * Given a raw PDF buffer:
 *  1. Tries text extraction with pdf-parse
 *  2. If text is long enough (≥ 200 chars) → returns it directly (digital PDF)
 *  3. Otherwise → renders up to MAX_PAGES_OCR pages to PNG via pdfjs-dist,
 *     runs OCR on each page with the standard Sharp+Tesseract pipeline,
 *     and merges the text from all pages.
 */
export async function processPDF(buffer: Buffer): Promise<PDFExtractResult> {
  // ── STEP 1: Try text extraction first ──────────────────────────────────────
  let digitalText = '';
  let pageCount   = 0;

  try {
    const result   = await pdfParse(buffer);
    digitalText    = (result.text ?? '').trim();
    pageCount      = result.numpages ?? 0;
    console.log(`[PDF] pdf-parse extracted ${digitalText.length} chars over ${pageCount} pages`);
  } catch (e: any) {
    console.warn('[PDF] pdf-parse failed:', e?.message);
    // Continue — will fall through to OCR path
  }

  // ── STEP 2: Is it digital? ─────────────────────────────────────────────────
  if (digitalText.length >= DIGITAL_TEXT_THRESHOLD) {
    console.log('[PDF] Digital PDF detected — using extracted text directly');
    return {
      text:      digitalText,
      isDigital: true,
      pageCount,
      pagesOCRd: 0,
    };
  }

  // ── STEP 3: Scanned PDF → render pages → OCR ──────────────────────────────
  console.log(`[PDF] Scanned PDF detected (text=${digitalText.length} chars < ${DIGITAL_TEXT_THRESHOLD}) — switching to OCR pipeline`);

  let pdfDoc: any | null = null;
  let actualPageCount = pageCount;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    pdfDoc = await loadingTask.promise;
    actualPageCount = pdfDoc.numPages;
    console.log(`[PDF] pdfjs loaded — ${actualPageCount} pages`);
  } catch (e: any) {
    console.error('[PDF] pdfjs-dist load failed:', e?.message);
    // Can't OCR — return whatever text we have with a warning
    return {
      text:      digitalText || '',
      isDigital: false,
      pageCount: actualPageCount,
      pagesOCRd: 0,
      warning:   'Could not render PDF pages for OCR. Please upload an image instead.',
    };
  }

  const pagesToProcess = Math.min(actualPageCount, MAX_PAGES_OCR);
  const pageTexts: string[] = [];
  let pagesOCRd = 0;

  for (let p = 1; p <= pagesToProcess; p++) {
    console.log(`[PDF] Rendering page ${p}/${pagesToProcess} for OCR...`);
    try {
      const pageBuffer = await renderPageToBuffer(pdfDoc, p);
      const pageText   = await ocrBuffer(pageBuffer);
      if (pageText.trim().length > 10) {
        pageTexts.push(pageText.trim());
        pagesOCRd++;
      }
    } catch (e: any) {
      console.warn(`[PDF] Page ${p} OCR failed:`, e?.message);
    }
  }

  const mergedText = pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
  console.log(`[PDF] Scanned OCR complete: ${pagesOCRd} pages, ${mergedText.length} chars`);

  const warning = pagesToProcess < actualPageCount
    ? `Only first ${pagesToProcess} of ${actualPageCount} pages were processed.`
    : undefined;

  return {
    text:      mergedText,
    isDigital: false,
    pageCount: actualPageCount,
    pagesOCRd,
    warning,
  };
}

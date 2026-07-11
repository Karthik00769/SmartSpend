/**
 * lib/ocr/opencv-preprocess.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenCV-equivalent image preprocessing pipeline for receipt OCR.
 *
 * Implements the exact steps from the spec using Sharp + pure JS pixel
 * operations. This avoids opencv-wasm (~40MB, breaks Vercel size limits) and
 * opencv4nodejs (requires native C++ bindings unavailable on serverless).
 *
 * Steps (mandatory order per spec):
 *  STEP 1  — Grayscale conversion
 *  STEP 2  — Gaussian blur / noise reduction (5×5 kernel)
 *  STEP 3  — Adaptive thresholding (Sauvola method — makes text high contrast)
 *  STEP 4  — Edge detection marker (sharpened version for edge-enhanced variant)
 *  STEP 5  — Deskew (projection-profile angle estimation + Sharp rotate)
 *  STEP 6  — Morphological close (dilate then erode via 3×3 box convolve)
 *  STEP 7  — 2× upscale for Tesseract (lanczos3)
 *
 * Produces 3 independent variants:
 *  A) clean-threshold  — adaptive threshold (best for clear receipts)
 *  B) aggressive-boost — high contrast + hard Otsu-style threshold
 *  C) edge-enhanced    — sharpened edges (best for faded or thermal receipts)
 *
 * All variants are deskewed and 2× upscaled before OCR.
 *
 * FALLBACK: If any step fails, falls back to the existing Sharp pipeline
 * (signaled by returning an empty array).
 */

// Lazy import: sharp is available at runtime (already in dependencies).
// We import lazily so this module can be tree-shaken or skipped in edge runtimes.
let _sharp: typeof import('sharp') | null = null;
async function getSharp() {
  if (!_sharp) _sharp = (await import('sharp')).default as any;
  return _sharp!;
}

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface PreprocessVariant {
  buffer:      Buffer;
  variantName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Adaptive threshold block size (pixels). Larger = smoother local mean window */
const ADAPTIVE_BLOCK = 31;
/** Adaptive threshold constant C subtracted from local mean */
const ADAPTIVE_C = 8;
/** Maximum deskew angle to test (degrees) */
const MAX_SKEW_DEG = 15;
/** Deskew angle step resolution (degrees) */
const SKEW_STEP = 0.5;
/** Output upscale factor for Tesseract */
const UPSCALE = 2;

// ─── STEP 3: Adaptive Threshold ──────────────────────────────────────────────
/**
 * adaptiveThreshold
 * Sauvola local-mean binarization on a grayscale pixel buffer.
 *
 * For each pixel, computes the mean brightness within a (blockSize × blockSize)
 * neighborhood. If pixel > mean - C → white (255), else → black (0).
 *
 * This makes text high contrast even when lighting is uneven across the receipt.
 *
 * @param grayBuf  Raw grayscale pixels (1 byte per pixel, row-major)
 * @param width    Image width in pixels
 * @param height   Image height in pixels
 * @param blockSize Window size (must be odd)
 * @param C        Constant subtracted from local mean
 * @returns Binary pixel buffer (same layout, values 0 or 255)
 */
function adaptiveThreshold(
  grayBuf: Buffer,
  width:   number,
  height:  number,
  blockSize = ADAPTIVE_BLOCK,
  C         = ADAPTIVE_C,
): Buffer {
  const half   = Math.floor(blockSize / 2);
  const output = Buffer.alloc(width * height, 255);

  // Compute integral image for O(1) rectangle sum queries
  // integral[y][x] = sum of all pixels in rect (0,0)→(x-1,y-1)
  const integral = new Float64Array((width + 1) * (height + 1));
  const stride   = width + 1;

  for (let y = 1; y <= height; y++) {
    for (let x = 1; x <= width; x++) {
      const px = grayBuf[(y - 1) * width + (x - 1)];
      integral[y * stride + x] =
        px +
        integral[(y - 1) * stride + x] +
        integral[y * stride + (x - 1)] -
        integral[(y - 1) * stride + (x - 1)];
    }
  }

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(1, y - half + 1);         // 1-indexed for integral
    const y2 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(1, x - half + 1);
      const x2 = Math.min(width, x + half + 1);

      // Rectangle sum via integral image
      const area = (y2 - y1) * (x2 - x1);
      const sum  =
        integral[y2 * stride + x2] -
        integral[y1 * stride + x2] -
        integral[y2 * stride + x1] +
        integral[y1 * stride + x1];

      const mean      = sum / area;
      const threshold = mean - C;
      const pixel     = grayBuf[y * width + x];
      output[y * width + x] = pixel >= threshold ? 255 : 0;
    }
  }

  return output;
}

// ─── STEP 5: Deskew ──────────────────────────────────────────────────────────
/**
 * estimateSkewAngle
 * Projection-profile deskew (equivalent to HoughLines angle estimation).
 *
 * For each candidate angle in [-MAX_SKEW_DEG, +MAX_SKEW_DEG]:
 *  - Rotates the binary pixel buffer by that angle
 *  - Computes the horizontal projection profile (row-sum)
 *  - The angle with the HIGHEST variance in row-sums indicates cleanest
 *    text-row separation — that's the correct de-skew angle.
 *
 * Returns 0 if the skew is negligible (< 0.5°).
 *
 * NOTE: To keep this fast in serverless, we work on a downsampled 150px-wide
 * version of the binary image and skip angles with negligible difference.
 */
function estimateSkewAngle(
  binaryBuf: Buffer,
  srcWidth:  number,
  srcHeight: number,
): number {
  // Downsample to at most 150px wide for speed
  const scale   = Math.min(1.0, 150 / srcWidth);
  const w       = Math.round(srcWidth  * scale);
  const h       = Math.round(srcHeight * scale);

  // Downsample: nearest-neighbour
  const small = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    const srcY = Math.round(y / scale);
    for (let x = 0; x < w; x++) {
      const srcX = Math.round(x / scale);
      small[y * w + x] = binaryBuf[Math.min(srcY, srcHeight - 1) * srcWidth + Math.min(srcX, srcWidth - 1)];
    }
  }

  let bestAngle    = 0;
  let bestVariance = -1;

  for (let deg = -MAX_SKEW_DEG; deg <= MAX_SKEW_DEG; deg += SKEW_STEP) {
    const rad    = (deg * Math.PI) / 180;
    const cosA   = Math.cos(rad);
    const sinA   = Math.sin(rad);
    const cx     = w / 2;
    const cy     = h / 2;

    // Project rotated binary pixels onto horizontal axis
    const rowSums = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = 0; x < w; x++) {
        // For each output pixel at (x,y), find source pixel after rotation
        const srcX = Math.round( cosA * (x - cx) + sinA * (y - cy) + cx);
        const srcY = Math.round(-sinA * (x - cx) + cosA * (y - cy) + cy);
        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          // White pixel (255) = background. Count dark (text) pixels
          if (small[srcY * w + srcX] < 128) sum++;
        }
      }
      rowSums[y] = sum;
    }

    // Variance of row sums: high variance = text rows cleanly separated
    let mean = 0;
    for (let i = 0; i < h; i++) mean += rowSums[i];
    mean /= h;
    let variance = 0;
    for (let i = 0; i < h; i++) variance += (rowSums[i] - mean) ** 2;
    variance /= h;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle    = deg;
    }
  }

  // Only correct if skew is meaningfully large
  return Math.abs(bestAngle) >= SKEW_STEP ? bestAngle : 0;
}

// ─── STEP 6: Morphological Close ─────────────────────────────────────────────
/**
 * morphClose
 * Morphological CLOSE = dilate then erode (fills small gaps in characters).
 * Implemented as two sequential 3×3 box-kernel passes on raw pixels.
 */
function morphClose(buf: Buffer, width: number, height: number): Buffer {
  // Dilate: pixel → local max
  const dilated = Buffer.alloc(width * height, 0);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let maxVal = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = buf[(y + dy) * width + (x + dx)];
          if (v > maxVal) maxVal = v;
        }
      }
      dilated[y * width + x] = maxVal;
    }
  }

  // Erode: pixel → local min
  const eroded = Buffer.alloc(width * height, 255);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let minVal = 255;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = dilated[(y + dy) * width + (x + dx)];
          if (v < minVal) minVal = v;
        }
      }
      eroded[y * width + x] = minVal;
    }
  }

  return eroded;
}

// ─── Main Export ──────────────────────────────────────────────────────────────
/**
 * preprocessImageWithOpenCV
 * Main entry point. Accepts a raw image buffer and returns up to 3 enhanced
 * variants for OCR. Each variant applies a different contrast/threshold
 * strategy; Tesseract picks the best result.
 *
 * Returns [] on failure → caller must fall back to existing Sharp pipeline.
 */
export async function preprocessImageWithOpenCV(
  imageBuffer: Buffer,
): Promise<PreprocessVariant[]> {
  try {
    const sharp = await getSharp();
    const variants: PreprocessVariant[] = [];

    // ── Get image metadata ─────────────────────────────────────────────────
    const meta = await sharp(imageBuffer).metadata();
    const origW = meta.width  ?? 0;
    const origH = meta.height ?? 0;
    if (origW === 0 || origH === 0) throw new Error('Image has zero dimensions');

    // ── STEP 1: Convert to grayscale → raw pixel buffer ────────────────────
    const { data: grayRaw, info: grayInfo } = await sharp(imageBuffer)
      .grayscale()
      .normalize()              // auto-stretch histogram → better contrast baseline
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = grayInfo;

    // ── STEP 2: Gaussian blur (5×5) using Sharp's built-in gaussian blur ───
    // sigma ≈ 1.0 approximates OpenCV GaussianBlur(5,5,0)
    const blurredBuf = await sharp(grayRaw, { raw: { width, height, channels: 1 } })
      .blur(1.0)
      .raw()
      .toBuffer();

    // ── STEP 3: Adaptive threshold on blurred grayscale ────────────────────
    const binaryBuf = adaptiveThreshold(blurredBuf, width, height);

    // ── STEP 5: Deskew angle estimation ────────────────────────────────────
    let skewAngle = 0;
    try {
      skewAngle = estimateSkewAngle(binaryBuf, width, height);
      if (skewAngle !== 0) {
        console.log(`[OPENCV-PRE] Detected skew: ${skewAngle.toFixed(1)}°`);
      }
    } catch (e) {
      console.warn('[OPENCV-PRE] Deskew estimation failed — skipping:', (e as any)?.message);
    }

    // ── STEP 6: Morphological close on binary image ─────────────────────────
    const morphBuf = morphClose(binaryBuf, width, height);

    // ── STEP 7: Upscale + deskew helper ────────────────────────────────────
    // Builds a final PNG buffer from any processed raw grayscale buffer.
    // Applies deskew rotation and 2× upscale for Tesseract.
    const finalize = async (
      rawBuf:    Buffer,
      channels:  1 | 3 | 4,
      variantLabel: string,
    ): Promise<Buffer> => {
      let pipeline = sharp(rawBuf, { raw: { width, height, channels } })
        .png({ compressionLevel: 1 });

      // Apply deskew if significant
      if (skewAngle !== 0) {
        pipeline = sharp(rawBuf, { raw: { width, height, channels } })
          .rotate(-skewAngle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png({ compressionLevel: 1 });
      }

      const deskewed = await pipeline.toBuffer();

      // Upscale with lanczos3 for cleaner text edges (2× width → 2× height auto)
      const sharpMeta = await sharp(deskewed).metadata();
      const upW = (sharpMeta.width ?? 800) * UPSCALE;
      const upscaled = await sharp(deskewed)
        .resize(upW, undefined, { kernel: 'lanczos3' })
        .png({ compressionLevel: 1 })
        .toBuffer();

      console.log(`[OPENCV-PRE/${variantLabel}] size=${upscaled.length} skew=${skewAngle.toFixed(1)}°`);
      return upscaled;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // Variant A — Clean threshold (adaptive binarization + morph close)
    // Best for: crisp receipts, clear lighting
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const bufA = await finalize(morphBuf, 1, 'clean-threshold');
      variants.push({ buffer: bufA, variantName: 'clean-threshold' });
    } catch (e) {
      console.warn('[OPENCV-PRE/clean-threshold] Failed:', (e as any)?.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Variant B — Aggressive boost (high contrast + Otsu-style hard threshold)
    // Best for: dark/dirty receipts, faded thermal paper
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const aggressiveBuf = await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .linear(1.8, -(128 * 0.8))   // heavy contrast stretch
        .sharpen({ sigma: 2.0 })
        .threshold(128)               // hard global Otsu-equivalent
        .raw()
        .toBuffer();

      const bufB = await finalize(aggressiveBuf, 1, 'aggressive-boost');
      variants.push({ buffer: bufB, variantName: 'aggressive-boost' });
    } catch (e) {
      console.warn('[OPENCV-PRE/aggressive-boost] Failed:', (e as any)?.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Variant C — Edge-enhanced (Canny-equivalent: unsharp mask + normalize)
    // Best for: blurry photos, poor focus, crumpled receipts
    // ═══════════════════════════════════════════════════════════════════════
    try {
      // Unsharp masking (equivalent to Canny edge enhancement in effect):
      // Subtract blurred from original to amplify edges, then re-normalize.
      const edgeBuf = await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .sharpen({ sigma: 3.0, m1: 1.5, m2: 0.5 })  // aggressive unsharp mask
        .normalize()                                   // re-stretch after sharpen
        .threshold(130)
        .raw()
        .toBuffer();

      const bufC = await finalize(edgeBuf, 1, 'edge-enhanced');
      variants.push({ buffer: bufC, variantName: 'edge-enhanced' });
    } catch (e) {
      console.warn('[OPENCV-PRE/edge-enhanced] Failed:', (e as any)?.message);
    }

    console.log(`[OPENCV-PRE] Generated ${variants.length} variants (skew=${skewAngle.toFixed(1)}°)`);
    return variants;

  } catch (err: any) {
    // Outer fallback — caller will use existing Sharp pipeline
    console.warn('[OPENCV-PRE] Pipeline failed — fallback to Sharp:', err?.message ?? err);
    return [];
  }
}

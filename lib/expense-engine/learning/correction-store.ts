/**
 * lib/ocr/correction-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Learning behavior: stores user corrections and reuses them for future OCR.
 *
 * When a user edits the auto-filled merchant or amount after OCR:
 *   → The original OCR snippet + corrected values are saved as a "mapping"
 *   → Next time the same merchant pattern appears, the correction is applied
 *
 * Storage: flat JSON file at `data/ocr-corrections.json` (server-side only).
 * This is a simple file-based store — suitable for a small SaaS with < 10k entries.
 * For larger scale, swap the file I/O with a DB table.
 *
 * THREAD SAFETY: We use atomic write (write-to-temp + rename pattern) so
 * concurrent serverless invocations don't corrupt the file.
 */

import fs   from 'node:fs/promises';
import path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OCRCorrection {
  /** Normalised merchant pattern extracted from OCR header lines */
  ocrMerchantPattern: string;
  /** User-corrected merchant name */
  correctedMerchant:  string;
  /** Optional: user-corrected amount (0 = no amount correction) */
  correctedAmount:    number;
  /** ISO timestamp of last correction */
  lastUpdated:        string;
  /** How many times this correction was applied */
  hitCount:           number;
}

export interface CorrectionStore {
  version:     number;
  corrections: OCRCorrection[];
}

// ─── File path ────────────────────────────────────────────────────────────────

const DATA_DIR         = path.join(process.cwd(), 'data');
const CORRECTIONS_FILE = path.join(DATA_DIR, 'ocr-corrections.json');
const TEMP_FILE        = path.join(DATA_DIR, 'ocr-corrections.tmp.json');

const STORE_VERSION = 1;

// ─── In-memory cache (avoids re-reading file on every request) ───────────────
let _cache: CorrectionStore | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000; // re-read file at most every 60 seconds

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function ensureDataDir(): Promise<void> {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); }
  catch { /* already exists */ }
}

async function readStore(): Promise<CorrectionStore> {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL_MS) return _cache;

  try {
    const raw = await fs.readFile(CORRECTIONS_FILE, 'utf-8');
    _cache     = JSON.parse(raw) as CorrectionStore;
    _cacheTime = now;
    return _cache;
  } catch {
    // File doesn't exist yet — return empty store
    const empty: CorrectionStore = { version: STORE_VERSION, corrections: [] };
    _cache     = empty;
    _cacheTime = now;
    return empty;
  }
}

async function writeStore(store: CorrectionStore): Promise<void> {
  await ensureDataDir();
  // Atomic write: temp file → rename
  await fs.writeFile(TEMP_FILE, JSON.stringify(store, null, 2), 'utf-8');
  await fs.rename(TEMP_FILE, CORRECTIONS_FILE);
  // Bust cache
  _cache     = store;
  _cacheTime = Date.now();
}

/**
 * normaliseMerchantPattern
 * Creates a consistent lookup key from a raw merchant string.
 * Lowercases, strips non-alpha, collapses spaces.
 * Example: "RELIANCE FRESH" → "reliance fresh"
 */
export function normaliseMerchantPattern(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * lookupCorrection
 * Given a raw OCR merchant string, returns the best stored correction (if any).
 *
 * Matching strategy (fuzzy):
 *  1. Exact normalised match
 *  2. Pattern is a substring of stored pattern (or vice-versa)
 *  3. Word-overlap ≥ 60%
 *
 * Returns null if no match found.
 */
export async function lookupCorrection(
  ocrMerchant: string,
): Promise<OCRCorrection | null> {
  if (!ocrMerchant || ocrMerchant.trim().length < 3) return null;

  const store  = await readStore();
  const needle = normaliseMerchantPattern(ocrMerchant);
  const needleWords = needle.split(' ').filter(Boolean);

  let best: { correction: OCRCorrection; score: number } | null = null;

  for (const c of store.corrections) {
    const hay      = c.ocrMerchantPattern;
    const hayWords = hay.split(' ').filter(Boolean);

    // Score 1: exact match
    if (hay === needle) return c; // immediate return

    // Score 2: substring
    let score = 0;
    if (hay.includes(needle) || needle.includes(hay)) score = 90;
    else {
      // Score 3: word overlap
      const matchWords = needleWords.filter(w => hayWords.includes(w));
      const overlap    = matchWords.length / Math.max(needleWords.length, hayWords.length);
      if (overlap >= 0.6) score = Math.round(overlap * 80);
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { correction: c, score };
    }
  }

  return best?.correction ?? null;
}

/**
 * saveCorrection
 * Upserts a correction into the store.
 * If the same OCR pattern already exists, updates it.
 * Otherwise adds a new entry.
 */
export async function saveCorrection(
  ocrMerchant:      string,
  correctedMerchant: string,
  correctedAmount:   number = 0,
): Promise<void> {
  if (!ocrMerchant || !correctedMerchant) return;

  const store   = await readStore();
  const pattern = normaliseMerchantPattern(ocrMerchant);

  const existing = store.corrections.find(c => c.ocrMerchantPattern === pattern);

  if (existing) {
    existing.correctedMerchant = correctedMerchant;
    if (correctedAmount > 0) existing.correctedAmount = correctedAmount;
    existing.lastUpdated = new Date().toISOString();
    existing.hitCount    = (existing.hitCount ?? 0) + 1;
  } else {
    store.corrections.push({
      ocrMerchantPattern: pattern,
      correctedMerchant,
      correctedAmount,
      lastUpdated:        new Date().toISOString(),
      hitCount:           1,
    });
  }

  // Cap store size at 1000 entries (oldest first out)
  if (store.corrections.length > 1000) {
    store.corrections.sort((a, b) =>
      new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime()
    );
    store.corrections = store.corrections.slice(-1000);
  }

  await writeStore(store);
  console.log(`[CORRECTION-STORE] Saved: "${pattern}" → "${correctedMerchant}" (amount=${correctedAmount})`);
}

/**
 * getAllCorrections
 * Returns the full correction list (admin/debug use).
 */
export async function getAllCorrections(): Promise<OCRCorrection[]> {
  const store = await readStore();
  return store.corrections;
}

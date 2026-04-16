/**
 * lib/offline/offlineStorage.ts
 * ─────────────────────────────────────────────────────────────────────
 * Offline queue for expense entries.
 *
 * Uses IndexedDB (preferred) with a localStorage fallback.
 * NEVER mutates the online API flow — only called when
 * navigator.onLine === false.
 *
 * Public surface:
 *   saveExpenseOffline(expense)   — queue an expense for later sync
 *   getOfflineExpenses()          — read the pending queue
 *   syncOfflineExpenses(poster)   — drain the queue by POSTing each entry
 */

import type { AddExpensePayload } from '@/hooks/use-expenses';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflineExpense {
  id:         string;           // client-generated UUID for dedup
  payload:    AddExpensePayload;
  status:     'pending_sync';
  created_at: string;           // ISO timestamp — used for safe-merge ordering
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME    = 'smartspend_offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_expenses';
const LS_KEY     = 'smartspend_offline_expenses'; // localStorage fallback key

// ─── UUID helper (no external dep) ───────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('created_at', 'created_at');
      }
    };

    req.onsuccess  = (e) => { _db = (e.target as IDBOpenDBRequest).result; resolve(_db!); };
    req.onerror    = ()  => reject(new Error('IndexedDB open failed'));
    req.onblocked  = ()  => reject(new Error('IndexedDB blocked'));
  });
}

function isIDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

// ─── IndexedDB implementation ─────────────────────────────────────────────────

async function idbSave(entry: OfflineExpense): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(new Error('IDB put failed'));
  });
}

async function idbGetAll(): Promise<OfflineExpense[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('created_at');
    const req   = index.getAll();
    req.onsuccess = () => resolve(req.result as OfflineExpense[]);
    req.onerror   = () => reject(new Error('IDB getAll failed'));
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(new Error('IDB delete failed'));
  });
}

// ─── localStorage fallback implementation ────────────────────────────────────

function lsSave(entry: OfflineExpense): void {
  const existing = lsGetAll();
  // Dedup by id
  const filtered = existing.filter(e => e.id !== entry.id);
  filtered.push(entry);
  localStorage.setItem(LS_KEY, JSON.stringify(filtered));
}

function lsGetAll(): OfflineExpense[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: OfflineExpense[] = JSON.parse(raw);
    // Sort ascending by created_at for safe merge ordering
    return parsed.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch {
    return [];
  }
}

function lsDelete(id: string): void {
  const existing = lsGetAll().filter(e => e.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(existing));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Queue an expense for later sync.
 * Called when navigator.onLine === false.
 */
export async function saveExpenseOffline(payload: AddExpensePayload): Promise<OfflineExpense> {
  const entry: OfflineExpense = {
    id:         uuid(),
    payload,
    status:     'pending_sync',
    created_at: new Date().toISOString(),
  };

  try {
    if (isIDBAvailable()) {
      await idbSave(entry);
    } else {
      lsSave(entry);
    }
  } catch (err) {
    console.warn('[offlineStorage] IDB failed, falling back to localStorage', err);
    lsSave(entry);
  }

  return entry;
}

/**
 * Return all pending (unsynced) expenses, ordered by created_at ascending.
 * Used for the offline banner count and for the sync loop.
 */
export async function getOfflineExpenses(): Promise<OfflineExpense[]> {
  try {
    if (isIDBAvailable()) {
      return await idbGetAll();
    }
    return lsGetAll();
  } catch (err) {
    console.warn('[offlineStorage] getOfflineExpenses fallback to LS', err);
    return lsGetAll();
  }
}

/**
 * Drain the queue — POST each pending expense to the backend,
 * then delete it locally if successful.
 *
 * @param poster  The same apiPost-backed addExpense function from the hook.
 *                Passed in so this module stays framework-agnostic.
 * @returns       Number of successfully synced entries.
 */
export async function syncOfflineExpenses(
  poster: (payload: AddExpensePayload) => Promise<unknown>,
): Promise<number> {
  const pending = await getOfflineExpenses();
  if (pending.length === 0) return 0;

  let synced = 0;

  for (const entry of pending) {
    try {
      await poster(entry.payload);

      // Delete from local store on success
      if (isIDBAvailable()) {
        await idbDelete(entry.id);
      } else {
        lsDelete(entry.id);
      }
      synced++;
    } catch (err) {
      // Leave in queue — will retry on next sync
      console.warn(`[offlineStorage] Failed to sync ${entry.id}, will retry:`, err);
    }
  }

  return synced;
}

/**
 * Quick synchronous check: are there any pending offline expenses?
 * Uses localStorage for sync access (IDB is async, not suitable for SSR guards).
 */
export function hasPendingOfflineExpenses(): boolean {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return false;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

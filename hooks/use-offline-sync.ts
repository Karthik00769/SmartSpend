'use client';
/**
 * hooks/use-offline-sync.ts
 * ─────────────────────────────────────────────────────────────────────
 * Monitors navigator.onLine and fires syncOfflineExpenses() automatically
 * when the browser reconnects.
 *
 * Also exposes:
 *   isOnline        — current network status (updated via events)
 *   pendingCount    — number of queued offline expenses
 *   isSyncing       — true while a sync pass is in progress
 *   triggerSync()   — manual sync (e.g. after coming back online)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  syncOfflineExpenses,
  getOfflineExpenses,
} from '@/lib/offline/offlineStorage';
import type { AddExpensePayload } from '@/hooks/use-expenses';

interface UseOfflineSyncOptions {
  /** The addExpense function from useExpenses / SmartSpend context */
  poster: (payload: AddExpensePayload) => Promise<unknown>;
  /** Called after a successful sync so parent can refresh data */
  onSynced?: (count: number) => void;
}

export interface UseOfflineSyncReturn {
  isOnline:     boolean;
  pendingCount: number;
  isSyncing:    boolean;
  triggerSync:  () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

export function useOfflineSync({
  poster,
  onSynced,
}: UseOfflineSyncOptions): UseOfflineSyncReturn {
  const [isOnline,     setIsOnline]     = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing,    setIsSyncing]    = useState<boolean>(false);

  // Keep poster stable across re-renders without stale closure
  const posterRef = useRef(poster);
  useEffect(() => { posterRef.current = poster; }, [poster]);

  const onSyncedRef = useRef(onSynced);
  useEffect(() => { onSyncedRef.current = onSynced; }, [onSynced]);

  // ── Refresh the pending count ────────────────────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    const items = await getOfflineExpenses();
    setPendingCount(items.length);
  }, []);

  // ── Core sync function ───────────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const count = await syncOfflineExpenses(posterRef.current);
      if (count > 0) {
        onSyncedRef.current?.(count);
      }
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isSyncing, refreshPendingCount]);

  // ── Network event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Small delay lets the backend stabilize before hitting it
      setTimeout(() => triggerSync(), 1500);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Seed the count on mount
    refreshPendingCount();

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once — triggerSync ref is stable

  // ── Re-check pending count whenever online status changes ───────────────────
  useEffect(() => {
    refreshPendingCount();
  }, [isOnline, refreshPendingCount]);

  return { isOnline, pendingCount, isSyncing, triggerSync, refreshPendingCount };
}

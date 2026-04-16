'use client';
/**
 * components/ui/offline-banner.tsx
 * ─────────────────────────────────────────────────────────────────────
 * Thin banner that sits above page content.
 * Shows only when offline OR when there are pending expenses to sync.
 * Disappears automatically once back online and synced.
 */

import { useEffect, useState } from 'react';

interface OfflineBannerProps {
  isOnline:     boolean;
  pendingCount: number;
  isSyncing:    boolean;
  onRetry?:     () => void;
}

export function OfflineBanner({
  isOnline,
  pendingCount,
  isSyncing,
  onRetry,
}: OfflineBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show banner if offline, or if there are still pending items to sync
    setVisible(!isOnline || pendingCount > 0);
  }, [isOnline, pendingCount]);

  if (!visible) return null;

  // ── Appearance states ────────────────────────────────────────────────────────
  const isOffline   = !isOnline;
  const hasPending  = pendingCount > 0;

  let bgClass  = 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300';
  let icon     = '📡';
  let message  = '';

  if (isOffline) {
    icon    = '📡';
    message = 'Offline mode — changes will sync automatically when you reconnect.';
    bgClass = 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300';
  } else if (isSyncing) {
    icon    = '🔄';
    message = `Syncing ${pendingCount} pending expense${pendingCount > 1 ? 's' : ''}…`;
    bgClass = 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300';
  } else if (hasPending) {
    icon    = '⏳';
    message = `${pendingCount} expense${pendingCount > 1 ? 's' : ''} queued — tap to sync now.`;
    bgClass = 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300';
  }

  return (
    <div
      className={`
        w-full px-4 py-2 border-b flex items-center justify-between gap-3
        text-xs font-medium transition-all duration-300
        ${bgClass}
      `}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2">
        <span
          className={isSyncing ? 'animate-spin inline-block' : ''}
          aria-hidden="true"
        >
          {icon}
        </span>
        {message}
      </span>

      {/* Retry button — only shown when online with pending items */}
      {isOnline && hasPending && !isSyncing && onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 underline underline-offset-2 hover:opacity-80 transition-opacity"
          aria-label="Sync now"
        >
          Sync now
        </button>
      )}
    </div>
  );
}

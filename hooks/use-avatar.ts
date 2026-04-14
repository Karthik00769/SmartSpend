'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// Simple pub/sub so settings page can notify navigation after upload
const listeners = new Set<() => void>();

export function notifyAvatarRefresh() {
  listeners.forEach(fn => fn());
}

export function useAvatar() {
  const { data: session } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fetchAvatar = useCallback(async () => {
    if (!session?.user) return;
    try {
      const res = await fetch('/api/settings/profile');
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data ?? json;
      // Prefer DB avatar_url, fall back to Google image
      setAvatarUrl(data.avatar_url || (session.user as any).image || null);
    } catch {
      setAvatarUrl((session.user as any).image || null);
    }
  }, [session]);

  useEffect(() => {
    fetchAvatar();
  }, [fetchAvatar]);

  useEffect(() => {
    listeners.add(fetchAvatar);
    return () => { listeners.delete(fetchAvatar); };
  }, [fetchAvatar]);

  return avatarUrl;
}

'use client';

import { useState, useEffect } from 'react';
import { DesktopSidebar, MobileTopBar, MobileOverlaySidebar } from './navigation';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { useSmartSpend } from '@/context/smartspend-context';

// Read the persisted collapsed state to set the correct initial margin
// without waiting for a useEffect (avoids layout shift).
function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; }
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Mirror the sidebar collapsed state so we can adjust the main margin
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const { isOnline, pendingCount, isSyncing, triggerSync } = useSmartSpend();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Keep collapsed state in sync with localStorage changes (from the sidebar toggle)
  useEffect(() => {
    const sync = () => {
      try {
        const v = localStorage.getItem('sidebarCollapsed');
        setCollapsed(v === 'true');
      } catch {}
    };
    // Poll every 100ms — lightweight, avoids cross-component prop drilling
    const id = setInterval(sync, 100);
    return () => clearInterval(id);
  }, []);

  const banner = (
    <OfflineBanner
      isOnline={isOnline}
      pendingCount={pendingCount}
      isSyncing={isSyncing}
      onRetry={triggerSync}
    />
  );

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <MobileTopBar onOpen={() => setMobileOpen(true)} />
        <MobileOverlaySidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
        {banner}
        <main className="flex-1 overflow-y-auto pt-14">
          <div className="max-w-2xl mx-auto px-4 py-5">
            {children}
          </div>
        </main>
      </div>
    );
  }

  const sidebarW = collapsed ? 'ml-16' : 'ml-56';

  return (
    <div className="flex h-screen bg-background">
      <DesktopSidebar />
      <main className={`flex-1 overflow-y-auto transition-[margin-left] duration-200 ease-in-out ${sidebarW}`}>
        {banner}
        <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

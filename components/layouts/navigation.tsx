'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { NAV_LINKS } from '@/lib/constants';
import { useAvatar } from '@/hooks/use-avatar';

// ─── Collapse state persisted in localStorage ─────────────────────────────────

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('sidebarCollapsed');
      if (stored !== null) setCollapsed(stored === 'true');
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebarCollapsed', String(next)); } catch {}
      return next;
    });
  };

  return { collapsed: mounted ? collapsed : false, toggle, mounted };
}

// ─── Tooltip wrapper (shown only when sidebar is collapsed) ───────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
        opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div className="bg-foreground text-background text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap shadow-lg">
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

export function DesktopSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, toggle } = useCollapsed();
  const avatarUrl = useAvatar();

  const w = collapsed ? 'w-16' : 'w-56';

  return (
    <aside
      className={`${w} bg-sidebar text-sidebar-foreground border-r border-sidebar-border
        fixed left-0 top-0 h-screen flex flex-col z-30
        transition-[width] duration-200 ease-in-out overflow-hidden`}
    >
      {/* Header */}
      <div className={`flex items-center border-b border-sidebar-border shrink-0
        ${collapsed ? 'justify-center px-0 py-4' : 'justify-between px-4 py-4'}`}>
        {!collapsed && (
          <span className="text-sm font-semibold text-sidebar-foreground tracking-tight truncate">
            SmartSpend
          </span>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-7 h-7 flex items-center justify-center rounded-md
            text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30
            transition-colors shrink-0"
        >
          {collapsed ? (
            // Right-pointing chevron when collapsed
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            // Left-pointing chevron / X when expanded
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.href;
          const item = (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center rounded-md text-sm font-medium transition-colors
                ${collapsed ? 'justify-center px-0 py-2.5 w-full' : 'gap-2.5 px-3 py-2'}
                ${isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30'
                }`}
            >
              <span className="text-base leading-none shrink-0">{link.icon}</span>
              {!collapsed && <span className="truncate">{link.label}</span>}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={link.href} label={link.label}>{item}</Tooltip>
          ) : item;
        })}
      </nav>

      {/* User + logout */}
      <div className="px-2 py-3 border-t border-sidebar-border shrink-0">
        {session?.user && !collapsed && (
          <div className="flex items-center gap-2 px-3 py-2 mb-1 min-w-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar"
                className="w-6 h-6 rounded-full shrink-0 object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-primary">
                  {(session.user.name ?? session.user.email ?? '?')[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                {session.user.name ?? 'User'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">
                {session.user.email}
              </p>
            </div>
          </div>
        )}

        {collapsed ? (
          <Tooltip label="Sign Out">
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full flex items-center justify-center py-2.5 rounded-md
                text-sidebar-foreground/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <span className="text-base leading-none">🚪</span>
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium
              text-sidebar-foreground/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <span className="text-base leading-none">🚪</span>
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── Mobile: top bar + slide-in overlay sidebar ───────────────────────────────

export function MobileTopBar({ onOpen }: { onOpen: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const avatarUrl = useAvatar();

  // Derive page title from current path
  const current = NAV_LINKS.find(l => l.href === pathname);
  const pageTitle = current?.label ?? 'SmartSpend';

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-background/95 backdrop-blur
      border-b border-border z-40 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpen}
          aria-label="Open menu"
          className="w-9 h-9 flex items-center justify-center rounded-md
            text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <span className="text-sm font-semibold text-foreground">{pageTitle}</span>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/add-expense"
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground
            text-xs font-medium rounded-md hover:bg-primary/90 transition-colors">
          + Add
        </Link>
        {session?.user && (
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar"
                className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-primary">
                {(session.user.name ?? session.user.email ?? '?')[0].toUpperCase()}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export function MobileOverlaySidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const avatarUrl = useAvatar();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on route change
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Drawer */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-sidebar text-sidebar-foreground
          z-50 flex flex-col shadow-xl
          transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          <span className="text-sm font-semibold text-sidebar-foreground">SmartSpend</span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="w-7 h-7 flex items-center justify-center rounded-md
              text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30'
                  }`}
              >
                <span className="text-base leading-none shrink-0">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="px-2 py-3 border-t border-sidebar-border">
          {session?.user && (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar"
                  className="w-7 h-7 rounded-full shrink-0 object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {(session.user.name ?? session.user.email ?? '?')[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">
                  {session.user.name ?? 'User'}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50 truncate">
                  {session.user.email}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium
              text-sidebar-foreground/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <span className="text-base leading-none">🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Legacy export — kept for any existing imports ────────────────────────────
export function Navigation() {
  return null; // replaced by AppLayout wiring below
}

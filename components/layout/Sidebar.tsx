'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { NAV_LINKS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
}

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside 
      className={cn(
        "hidden md:flex flex-col bg-card text-card-foreground border-r border-border fixed left-0 top-0 h-screen z-30 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Brand header */}
      <div className={cn("flex items-center border-b border-border transition-all duration-300", isCollapsed ? "p-4 justify-center" : "px-5 py-4 gap-3 justify-between")}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
            <span className="text-white text-lg">💎</span>
          </div>
          {!isCollapsed && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent truncate animate-in fade-in duration-300">
              SmartSpend
            </h1>
          )}
        </div>

        {/* Close button — only visible when sidebar is open */}
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Collapse sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Expand button — floating pill when collapsed */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="absolute -right-3 top-16 z-50 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/40 hover:scale-110 transition-transform"
          title="Expand sidebar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}


      <nav className="flex flex-col flex-1 px-4 space-y-2 py-4 overflow-y-auto overflow-x-hidden">
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`)) || (pathname.includes('expenses') && link.href.includes('expenses-history'));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center rounded-xl transition-all font-medium group',
                isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={isCollapsed ? link.label : undefined}
            >
              <span className={cn('text-xl transition-transform group-hover:scale-110', isActive ? 'scale-110' : '')}>
                {link.icon}
              </span>
              {!isCollapsed && <span className="truncate animate-in fade-in slide-in-from-left-2 duration-300">{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User profile footer is handled after nav */}
      {session?.user && (
        <div className="p-4 border-t border-border group relative flex flex-col mt-auto">
          {/* Hover Menu */}
          {!isCollapsed && (
            <div className="absolute bottom-full left-4 bg-popover border border-border rounded-xl shadow-2xl p-4 w-[calc(100%-2rem)] flex-col gap-3 hidden group-hover:flex z-50 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200 after:content-[''] after:absolute after:-bottom-4 after:left-0 after:right-0 after:h-4">
              <div>
                <p className="text-sm font-bold text-foreground truncate">{session.user.name || 'Account Settings'}</p>
                <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
              </div>
              <div className="w-full h-px bg-border" />
              <div className="space-y-1">
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="flex items-center gap-2 text-left text-sm text-red-500 hover:text-red-600 transition-colors w-full font-bold pt-1"
                >
                  <span>🚪</span> Sign Out
                </button>
              </div>
            </div>
          )}
          
          <div className={cn(
            "flex items-center rounded-xl hover:bg-muted cursor-pointer transition-all border border-transparent hover:border-border/50 group/item shadow-sm hover:shadow-none",
            isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
          )}>
            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold shrink-0 shadow-inner overflow-hidden relative">
              {session.user.image ? (
                <img 
                  src={session.user.image} 
                  alt={session.user.name || 'User'} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                  {session.user.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            </div>
            {!isCollapsed && (
              <>
                <div className="min-w-0 flex-1 anime-in fade-in">
                  <p className="text-sm font-bold truncate leading-none mb-1 text-foreground">
                    {session.user.name || 'Account'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate font-medium">Verified User</p>
                </div>
                <span className="text-muted-foreground/30 text-[10px] group-hover/item:text-primary/50 transition-colors">▲</span>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

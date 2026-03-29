'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { NAV_LINKS } from '@/lib/constants';
import { useIsMobile } from '@/hooks/use-mobile';

export function Navigation() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 flex justify-around">
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-primary border-t-2 border-primary -mt-0.5'
                  : 'text-muted-foreground'
              }`}
            >
              <span className="text-xl mb-1">{link.icon}</span>
              <span className="text-center line-clamp-1">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <aside className="w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed left-0 top-0 h-screen overflow-y-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-sidebar-foreground mb-8">
          SmartSpend
        </h1>
        <nav className="space-y-2">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/20'
                }`}
              >
                <span className="text-xl">{link.icon}</span>
                <span className="font-medium">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

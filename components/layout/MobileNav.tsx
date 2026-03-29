'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();

  // Mobile navigation footer template
  const navItems = NAV_LINKS.filter(
    (item) =>
      ['Dashboard', 'Add Expense', 'Budget', 'Goals', 'Insights'].includes(
        item.label
      ) ||
      ['/dashboard', '/add-expense', '/budget', '/goals', '/insights'].includes(
        item.href
      )
  );

  return (
    <nav className="fixed md:hidden bottom-0 left-0 right-0 h-16 bg-background border-t border-border z-50 flex items-center justify-around px-2 backdrop-blur-md bg-opacity-80">
      {navItems.map((link) => {
        const isActive = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'flex flex-col items-center justify-center flex-1 py-1 text-center transition-all duration-200 outline-none select-none',
              isActive
                ? 'text-primary scale-105'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'text-xl transition-transform block',
                isActive ? 'scale-110' : 'scale-100'
              )}
            >
              {link.icon}
            </span>
            <span
              className={cn(
                'text-[10px] font-medium tracking-wide mt-0.5 line-clamp-1',
                isActive ? 'font-semibold' : 'opacity-85'
              )}
            >
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

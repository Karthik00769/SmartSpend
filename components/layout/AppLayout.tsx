'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar navigations */}
      <Sidebar />

      {/* Main page content layout container */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64 h-full relative">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile nav footer content footer placement container */}
      <MobileNav />
    </div>
  );
}

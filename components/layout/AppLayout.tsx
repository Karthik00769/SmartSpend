import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar navigations */}
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      {/* Main page content layout container */}
      <div 
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out h-full relative",
          isCollapsed ? "md:pl-20" : "md:pl-64"
        )}
      >
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile nav footer content footer placement container */}
      <MobileNav />
    </div>
  );
}

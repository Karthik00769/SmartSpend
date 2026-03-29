import { Navigation } from './navigation';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <div className="flex h-screen bg-background">
      {!isMobile && <Navigation />}
      <main className={`flex-1 overflow-y-auto ${!isMobile ? 'ml-60' : 'mb-20'}`}>
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>
      {isMobile && <Navigation />}
    </div>
  );
}

'use client';

import { AppLayout }         from '@/components/layouts/app-layout';
import { SmartSpendProvider } from '@/context/smartspend-context';
import { FinanceProvider }    from '@/context/FinanceContext';
import { useSession }         from 'next-auth/react';
import { Skeleton }           from '@/components/ui/skeleton';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    );
  }

  // Fallback to '1' only heavily defensively, middleware handles strict redirects prior
  const userId = (session?.user as any)?.id || '1';

  return (
    <SmartSpendProvider>
      <FinanceProvider>
        <AppLayout>{children}</AppLayout>
      </FinanceProvider>
    </SmartSpendProvider>
  );
}


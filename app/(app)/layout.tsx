'use client';

import { AppLayout }         from '@/components/layouts/app-layout';
import { SmartSpendProvider } from '@/context/smartspend-context';
import { useSession }         from 'next-auth/react';
import { useRouter }          from 'next/navigation';
import { useEffect }          from 'react';
import { Skeleton }           from '@/components/ui/skeleton';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Middleware handles the redirect at the edge, but this is a client-side
    // safety net for cases where the session expires while the user is active.
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

  return (
    <SmartSpendProvider>
      <AppLayout>{children}</AppLayout>
    </SmartSpendProvider>
  );
}


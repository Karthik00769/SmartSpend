'use client';

import React, { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useSession, signIn, signOut, SessionProvider } from 'next-auth/react';

// ─── User model ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id:          string;
  name:        string;
  email:       string;
  avatarUrl?:  string;
  /** Monthly income (used for savings-rate calculations) */
  monthlyIncome: number;
  /** ISO timestamp of last login */
  lastLoginAt: string;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** null while loading or when unauthenticated */
  user:             AuthUser | null;
  isAuthenticated:  boolean;
  isLoading:        boolean;

  /**
   * NextAuth sign in via credentials
   */
  login:  (email: string, password: string) => Promise<{ success: boolean; error?: string }>;

  /** Clears auth state and redirects to /login */
  logout: () => void;

  /** Patch specific user fields (Not fully persistent with raw NextAuth session automatically) */
  updateUser: (partial: Partial<AuthUser>) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Internal Provider ────────────────────────────────────────────────────────────

function AuthContextProviderInternal({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';

  const user: AuthUser | null = session?.user
    ? {
        id: (session.user as any).id || '',
        name: session.user.name || 'User',
        email: session.user.email || '',
        avatarUrl: session.user.image || undefined,
        monthlyIncome: 0, // Real value fetched from DB via dashboard-summary/reports APIs
        lastLoginAt: new Date().toISOString(),
      }
    : null;

  // ── login ────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await signIn('credentials', {
          redirect: false,
          email,
          password,
        });

        if (res?.error) {
          return { success: false, error: res.error };
        }
        if (res?.ok) {
          return { success: true };
        }
        return { success: false, error: 'Failed to access account' };
      } catch {
        return { success: false, error: 'An unexpected error occurred.' };
      }
    },
    []
  );

  // ── logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await signOut({ callbackUrl: '/login' });
  }, []);

  // ── updateUser ───────────────────────────────────────────────────────────
  const updateUser = useCallback((_partial: Partial<AuthUser>) => {
    // Profile updates are persisted via /api/settings/profile — session
    // is refreshed by NextAuth on the next request automatically.
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Provider Wrapper ────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <SessionProvider>
      <AuthContextProviderInternal>{children}</AuthContextProviderInternal>
    </SessionProvider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used inside <AuthProvider>. Wrap your app in <AuthProvider>.');
  }
  return ctx;
}

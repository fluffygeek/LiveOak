'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserRole } from '@liveoak/shared-types';

export type CurrentUser = {
  id: string;
  email: string;
  role: UserRole;
  active: boolean;
};

interface AuthContextValue {
  accessToken: string | null;
  user: CurrentUser | null;
  loading: boolean;
  signInWithIdToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchMe(accessToken: string): Promise<CurrentUser | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Holds the access token only in memory (never localStorage, per the design
 * plan's security section) and re-hydrates it on load via the httpOnly
 * refresh cookie, so a page refresh doesn't force a fresh Google sign-in.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (res.ok) {
          const { accessToken: token } = await res.json();
          setAccessToken(token);
          setUser(await fetchMe(token));
        }
      } catch {
        // Network failure during session restore — fall through to signed-out.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signInWithIdToken = useCallback(async (idToken: string) => {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'sign_in_failed');
    }
    const { accessToken: token } = await res.json();
    setAccessToken(token);
    setUser(await fetchMe(token));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ accessToken, user, loading, signInWithIdToken, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

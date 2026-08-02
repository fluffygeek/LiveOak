'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  /** Re-hydrates the access token from the httpOnly refresh cookie — used by the API client on a 401. */
  refreshAccessToken: () => Promise<string | null>;
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
  // The backend rotates refresh tokens on every use, so concurrent 401s must
  // share one refresh call — otherwise the second caller's now-stale token
  // gets rejected and incorrectly signs the user out of a valid session.
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const refreshAccessToken = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    refreshInFlight.current = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!res.ok) {
          setAccessToken(null);
          setUser(null);
          return null;
        }
        const { accessToken: token } = await res.json();
        setAccessToken(token);
        return token as string;
      } catch {
        return null;
      }
    })();

    return refreshInFlight.current.finally(() => {
      refreshInFlight.current = null;
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (token) setUser(await fetchMe(token));
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
    <AuthContext.Provider value={{ accessToken, user, loading, signInWithIdToken, signOut, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

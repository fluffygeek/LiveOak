import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { UserRole } from '@liveoak/shared-types';
import { apiUrl } from './api-url';
import { fetchWithTimeout } from './fetch-with-timeout';

export type CurrentUser = {
  id: string;
  email: string;
  role: UserRole;
  active: boolean;
};

const ACCESS_TOKEN_KEY = 'liveoak_access_token';
const REFRESH_TOKEN_KEY = 'liveoak_refresh_token';

interface AuthContextValue {
  accessToken: string | null;
  user: CurrentUser | null;
  loading: boolean;
  signInWithIdToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetches the current access token, refreshing it first if needed — used by the API client on a 401. */
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchMe(accessToken: string): Promise<CurrentUser | null> {
  const res = await fetchWithTimeout(`${apiUrl()}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Tokens are stored in expo-secure-store (OS keychain/keystore-backed
 * encrypted storage) — appropriate for a native mobile app, unlike the web
 * admin's browser-based storage constraints. See design plan §8.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Refresh tokens are rotated server-side on every use, so two concurrent
  // 401s (e.g. two screens fetching in parallel) must share one refresh
  // call — otherwise the second request's stale token gets rejected and
  // incorrectly signs the user out of a perfectly valid session.
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const persistTokens = useCallback(async (access: string, refresh: string) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
    setAccessTokenState(access);
  }, []);

  const clearTokens = useCallback(async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setAccessTokenState(null);
    setUser(null);
  }, []);

  const refreshAccessToken = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    refreshInFlight.current = (async () => {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) return null;
      try {
        const res = await fetchWithTimeout(`${apiUrl()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          await clearTokens();
          return null;
        }
        const { accessToken: newAccess, refreshToken: newRefresh } = await res.json();
        await persistTokens(newAccess, newRefresh);
        return newAccess;
      } catch {
        return null;
      }
    })();

    return refreshInFlight.current.finally(() => {
      refreshInFlight.current = null;
    });
  }, [clearTokens, persistTokens]);

  useEffect(() => {
    (async () => {
      try {
        const storedAccess = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        if (storedAccess) {
          const me = await fetchMe(storedAccess);
          if (me) {
            setAccessTokenState(storedAccess);
            setUser(me);
          } else {
            const refreshed = await refreshAccessToken();
            if (refreshed) setUser(await fetchMe(refreshed));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signInWithIdToken = useCallback(
    async (idToken: string) => {
      const res = await fetchWithTimeout(`${apiUrl()}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'sign_in_failed');
      }
      const { accessToken: access, refreshToken: refresh } = await res.json();
      await persistTokens(access, refresh);
      const me = await fetchMe(access);
      if (!me) {
        // Token exchange succeeded but the profile lookup failed — don't
        // leave the caller in a half-signed-in state with user === null.
        await clearTokens();
        throw new Error('profile_fetch_failed');
      }
      setUser(me);
    },
    [clearTokens, persistTokens],
  );

  const signOut = useCallback(async () => {
    await clearTokens();
  }, [clearTokens]);

  return (
    <AuthContext.Provider
      value={{ accessToken, user, loading, signInWithIdToken, signOut, refreshAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

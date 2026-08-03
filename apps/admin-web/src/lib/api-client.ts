'use client';

import { useCallback } from 'react';
import { useAuth } from './auth-context';

function apiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error('NEXT_PUBLIC_API_URL is not set');
  return url;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Authenticated fetch wrapper: attaches the bearer token, and on a 401
 * (expired access token) refreshes once and retries before giving up.
 * Mirrors apps/mobile's useApiClient.
 */
export function useApiClient() {
  const { accessToken, refreshAccessToken, signOut } = useAuth();

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const doFetch = (token: string | null) => {
        const headers = new Headers(init.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(`${apiUrl()}${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      };

      let res = await doFetch(accessToken);
      if (res.status === 401) {
        // refreshAccessToken rejects on a transport failure rather than
        // returning null — only a confirmed auth rejection (null) should
        // sign the user out.
        let refreshed: string | null;
        try {
          refreshed = await refreshAccessToken();
        } catch {
          return res;
        }
        if (!refreshed) {
          await signOut();
          return res;
        }
        res = await doFetch(refreshed);
      }
      return res;
    },
    [accessToken, refreshAccessToken, signOut],
  );

  return { apiFetch };
}

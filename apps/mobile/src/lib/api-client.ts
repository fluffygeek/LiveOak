import { useCallback } from 'react';
import { apiUrl } from './api-url';
import { useAuth } from './auth-context';

/**
 * Authenticated fetch wrapper: attaches the bearer token, and on a 401
 * (expired access token) refreshes once and retries before giving up.
 */
export function useApiClient() {
  const { accessToken, refreshAccessToken, signOut } = useAuth();

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const doFetch = (token: string | null) =>
        fetch(`${apiUrl()}${path}`, {
          ...init,
          headers: {
            ...(init.headers ?? {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

      let res = await doFetch(accessToken);
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
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

import type { NextResponse } from 'next/server';

/** Server-side base URL for reaching the API from route handlers. */
export function apiUrl(): string {
  const url = process.env.API_URL;
  if (!url) throw new Error('API_URL is not set');
  return url;
}

export const REFRESH_COOKIE_NAME = 'liveoak_refresh';

/** Shared cookie policy for the refresh token, used by both the sign-in and refresh routes. */
export function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days, matches backend refresh token expiry
  });
}

const BACKEND_FETCH_TIMEOUT_MS = 10_000;

/**
 * Bounds requests to the API so a hung backend can't leave a route handler
 * (and the client waiting on it) open until infrastructure kills it. Callers
 * should catch the rejection (abort or network failure) and return a 502.
 */
export function fetchBackend(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${apiUrl()}${path}`, { ...init, signal: AbortSignal.timeout(BACKEND_FETCH_TIMEOUT_MS) });
}

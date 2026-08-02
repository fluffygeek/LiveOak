/** Server-side base URL for reaching the API from route handlers. */
export function apiUrl(): string {
  const url = process.env.API_URL;
  if (!url) throw new Error('API_URL is not set');
  return url;
}

export const REFRESH_COOKIE_NAME = 'liveoak_refresh';

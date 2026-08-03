/**
 * Expo inlines any env var prefixed EXPO_PUBLIC_ into the client bundle at
 * build time — see apps/mobile's .env / eas config once those exist.
 */
export function apiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error('EXPO_PUBLIC_API_URL is not set');
  return url;
}

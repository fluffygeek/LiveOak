/**
 * React Native 0.74's JS engine (Hermes + RN's fetch polyfill) doesn't
 * implement the `AbortSignal.timeout()` static method — calling it throws
 * `TypeError: AbortSignal.timeout is not a function`. Use a manual
 * AbortController + setTimeout instead, which works everywhere.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

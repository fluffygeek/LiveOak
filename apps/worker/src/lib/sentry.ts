import * as Sentry from '@sentry/node';

let enabled = false;

/**
 * Error monitoring is opt-in: with no SENTRY_DSN configured (e.g. local
 * dev, or before it's provisioned in a given environment), this is a no-op
 * rather than a startup failure.
 */
export function initSentry(dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
  enabled = true;
}

export function captureException(error: unknown): void {
  if (!enabled) return;
  Sentry.captureException(error);
}

/**
 * Drains the pending event queue with a bounded wait, for use right before a
 * fatal process.exit — without this, a captured startup error can be lost if
 * the process exits before Sentry's transport has sent it. Never throws: a
 * flush failure must not block the exit it's guarding.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // best-effort only
  }
}

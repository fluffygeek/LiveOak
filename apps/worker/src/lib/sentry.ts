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

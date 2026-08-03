import { Redis } from 'ioredis';

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  return url;
}

/**
 * Worker connections must use `maxRetriesPerRequest: null` (BullMQ's
 * requirement for its blocking commands) so a job in flight isn't dropped
 * mid-retry.
 */
export function createWorkerRedisConnection() {
  return new Redis(requireRedisUrl(), { maxRetriesPerRequest: null });
}

/**
 * Queue connections use a finite retry limit instead of `null` — `null`
 * would leave calls like `upsertJobScheduler` pending indefinitely during a
 * Redis outage, which would keep `main()` from ever reaching its `.catch()`
 * and reporting the failure.
 */
export function createQueueRedisConnection() {
  return new Redis(requireRedisUrl(), { maxRetriesPerRequest: 1 });
}

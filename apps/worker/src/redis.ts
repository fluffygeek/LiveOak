import { Redis } from 'ioredis';

export function createRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  // BullMQ requires this option on its Redis connections.
  return new Redis(url, { maxRetriesPerRequest: null });
}

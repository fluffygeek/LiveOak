import { z } from 'zod';
import { logger } from './lib/logger.js';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  USPS_CLIENT_ID: z.string().optional(),
  USPS_CLIENT_SECRET: z.string().optional(),
  // Optional: the digest job logs and skips sending (rather than failing
  // the run) when Postmark isn't configured yet — see sendDiscrepancyDigest.
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  DIGEST_EMAIL_FROM: z.string().optional(),
  // Optional: error monitoring is a no-op without this configured. Blank
  // values are normalized to undefined so an empty env var behaves the same
  // as an unset one, rather than being handed to Sentry.init() as "".
  SENTRY_DSN: z.preprocess((val) => (val === '' ? undefined : val), z.string().url().optional()),
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates process.env once at boot; throws with a clear message on misconfiguration. */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    logger.error({ fieldErrors: result.error.flatten().fieldErrors }, 'Invalid environment configuration');
    process.exit(1);
  }
  return result.data;
}

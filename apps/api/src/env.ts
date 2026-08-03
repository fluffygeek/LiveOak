import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Railway (and most PaaS hosts) assign the listen port dynamically via
  // `PORT` — when set, it takes precedence over API_PORT.
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // 32 chars minimum so a short/low-entropy secret can't make HMAC-signed
  // tokens forgeable.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  GOOGLE_OAUTH_CLIENT_ID_WEB: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID_IOS: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID_ANDROID: z.string().optional(),
  // Required, not optional: /auth/google's Workspace-domain restriction is a
  // core security control (design plan §7) and must not silently no-op.
  GOOGLE_WORKSPACE_DOMAIN: z.string().min(1),
  USPS_CLIENT_ID: z.string().optional(),
  USPS_CLIENT_SECRET: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Set for S3-compatible providers (Cloudflare R2, MinIO); leave unset for real AWS S3.
  S3_ENDPOINT: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
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
    console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

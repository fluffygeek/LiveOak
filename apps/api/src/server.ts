import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { ZodError } from 'zod';
import type { S3Client } from '@aws-sdk/client-s3';
import { createDb, type Db } from '@liveoak/db';
import { loadEnv, type Env } from './env.js';
import { authenticate } from './middleware/rbac.js';
import { createS3Client } from './lib/s3.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { userRoutes } from './routes/users.js';
import { jobDraftRoutes } from './routes/jobDrafts.js';
import { jobRoutes } from './routes/jobs.js';
import { workCodeRoutes } from './routes/workCodes.js';
import { payrollJobRoutes } from './routes/payrollJobs.js';
import { discrepancyReasonRoutes } from './routes/discrepancyReasons.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    db: Db;
    s3: S3Client;
  }
}

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  app.decorate('env', env);
  app.decorate('db', createDb(env.DATABASE_URL));
  app.decorate('s3', createS3Client(env));

  await app.register(fastifyCors, {
    origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  await app.register(fastifyJwt, { secret: env.JWT_ACCESS_SECRET });
  app.decorate('authenticate', authenticate);

  // Routes that call schema.parse() directly (rather than safeParse) land
  // here on bad input — map that to 400 instead of Fastify's default 500,
  // since it's the caller's fault, not the server's.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid_request', details: error.flatten() });
    }
    request.log.error(error);
    // Never forward the raw error to the client — it can leak internals
    // (e.g. Postgres constraint/column names). Only a Fastify-assigned 4xx
    // (validation, not-found, etc.) is safe to pass through as-is.
    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) {
      return reply.code(statusCode).send({ error: error.message });
    }
    return reply.code(500).send({ error: 'internal_server_error' });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(userRoutes);
  await app.register(jobDraftRoutes);
  await app.register(jobRoutes);
  await app.register(workCodeRoutes);
  await app.register(payrollJobRoutes);
  await app.register(discrepancyReasonRoutes);

  // Remaining route groups (duplicate review, app_admin config) register
  // here as they're implemented in Phases 4-5 — see the API surface
  // section of the design plan for the full list.

  return app;
}

async function main() {
  const app = await buildServer();
  await app.listen({ port: app.env.API_PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

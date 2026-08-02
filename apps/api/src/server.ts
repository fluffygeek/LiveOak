import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { createDb, type Db } from '@liveoak/db';
import { loadEnv, type Env } from './env.js';
import { authenticate } from './middleware/rbac.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { userRoutes } from './routes/users.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    db: Db;
  }
}

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  app.decorate('env', env);
  app.decorate('db', createDb(env.DATABASE_URL));

  await app.register(fastifyCors, {
    origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  await app.register(fastifyJwt, { secret: env.JWT_ACCESS_SECRET });
  app.decorate('authenticate', authenticate);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(userRoutes);

  // Remaining role-scoped route groups (job drafts/submission, payroll admin
  // record edits, config) register here as they're implemented in Phases
  // 2-5 — see the API surface section of the design plan for the full list.

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

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { createDb, type Db } from '@liveoak/db';
import { loadEnv, type Env } from './env.js';
import { authenticate } from './middleware/rbac.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';

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

  await app.register(fastifyJwt, { secret: env.JWT_ACCESS_SECRET });
  app.decorate('authenticate', authenticate);

  await app.register(healthRoutes);
  await app.register(authRoutes);

  // Role-scoped route groups (technician / payroll_admin / app_admin) register
  // here as they're implemented in Phase 1-5 — see docs/phase-0-checklist.md
  // and the API surface section of the design plan for the full route list.

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

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { workCodes } from '@liveoak/db';
import { authenticate, requireActiveUser } from '../middleware/rbac.js';

/**
 * Read-only for now — every authenticated active user can list active work
 * codes (needed by the technician mobile form). Write endpoints
 * (create/edit) are Application Administrator config, added in Phase 5.
 */
export async function workCodeRoutes(app: FastifyInstance) {
  app.get('/work-codes', { preHandler: [authenticate, requireActiveUser] }, async () => {
    return app.db.select().from(workCodes).where(eq(workCodes.active, true));
  });
}

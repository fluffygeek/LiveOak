import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { appConfig } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';

const updateBody = z.object({
  value: z.unknown(),
});

/**
 * App-admin-only: singleton key/value settings (USPS kill switch, digest
 * send-hour override, etc — see design plan §2). Keys are seeded by
 * migration; this only updates existing keys, it doesn't create new ones.
 */
export async function appConfigRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireActiveUser, requireRole(['app_admin'])];

  app.get('/config', { preHandler: guards }, async () => {
    return app.db.select().from(appConfig).orderBy(asc(appConfig.key));
  });

  app.patch<{ Params: { key: string } }>('/config/:key', { preHandler: guards }, async (request, reply) => {
    const body = updateBody.parse(request.body);
    const [updated] = await app.db
      .update(appConfig)
      .set({ value: body.value, updatedBy: request.currentUser!.id, updatedAt: new Date() })
      .where(eq(appConfig.key, request.params.key))
      .returning();
    if (!updated) {
      return reply.code(404).send({ error: 'config_key_not_found' });
    }
    return reply.send(updated);
  });
}

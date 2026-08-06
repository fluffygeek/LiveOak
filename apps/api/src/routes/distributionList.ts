import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { distributionList } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';

const createBody = z.object({
  email: z.string().email(),
  label: z.string().optional(),
});

const UNIQUE_VIOLATION = '23505';

// Guards against a malformed :id reaching a uuid-column query and failing
// with a raw Postgres error (reported as an opaque 500) instead of a 400.
const idParams = z.object({ id: z.string().uuid() });

/** App-admin-only: recipients of the nightly discrepancy digest email. */
export async function distributionListRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireActiveUser, requireRole(['app_admin'])];

  app.get('/distribution-list', { preHandler: guards }, async () => {
    return app.db.select().from(distributionList).orderBy(asc(distributionList.email));
  });

  app.post('/distribution-list', { preHandler: guards }, async (request, reply) => {
    const body = createBody.parse(request.body);
    try {
      const [created] = await app.db.insert(distributionList).values(body).returning();
      return reply.code(201).send(created);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        return reply.code(409).send({ error: 'recipient_already_exists' });
      }
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>('/distribution-list/:id', { preHandler: guards }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const [deleted] = await app.db
      .delete(distributionList)
      .where(eq(distributionList.id, id))
      .returning();
    if (!deleted) {
      return reply.code(404).send({ error: 'recipient_not_found' });
    }
    return reply.code(204).send();
  });
}

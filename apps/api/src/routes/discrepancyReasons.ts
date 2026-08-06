import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { discrepancyReasons } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';

const createBody = z.object({
  label: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

const updateBody = z.object({
  label: z.string().min(1).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const UNIQUE_VIOLATION = '23505';

// Guards against a malformed :id reaching a uuid-column query and failing
// with a raw Postgres error (reported as an opaque 500) instead of a 400.
const idParams = z.object({ id: z.string().uuid() });

/**
 * GET is available to any active user (needed by the payroll admin record
 * editor's dropdown); app_admin sees inactive reasons too, so they can be
 * re-activated. Write endpoints are app_admin-only config work (Phase 5).
 */
export async function discrepancyReasonRoutes(app: FastifyInstance) {
  app.get('/discrepancy-reasons', { preHandler: [authenticate, requireActiveUser] }, async (request) => {
    const includeInactive = request.currentUser!.role === 'app_admin';
    return app.db
      .select()
      .from(discrepancyReasons)
      .where(includeInactive ? undefined : eq(discrepancyReasons.active, true))
      .orderBy(asc(discrepancyReasons.sortOrder), asc(discrepancyReasons.label));
  });

  const adminGuards = [authenticate, requireActiveUser, requireRole(['app_admin'])];

  app.post('/discrepancy-reasons', { preHandler: adminGuards }, async (request, reply) => {
    const body = createBody.parse(request.body);
    try {
      const [created] = await app.db.insert(discrepancyReasons).values(body).returning();
      return reply.code(201).send(created);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        return reply.code(409).send({ error: 'discrepancy_reason_already_exists' });
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/discrepancy-reasons/:id',
    { preHandler: adminGuards },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = updateBody.parse(request.body);
      if (Object.keys(body).length === 0) {
        return reply.code(400).send({ error: 'no_fields_to_update' });
      }
      try {
        const [updated] = await app.db
          .update(discrepancyReasons)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(discrepancyReasons.id, id))
          .returning();
        if (!updated) {
          return reply.code(404).send({ error: 'discrepancy_reason_not_found' });
        }
        return reply.send(updated);
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          return reply.code(409).send({ error: 'discrepancy_reason_already_exists' });
        }
        throw err;
      }
    },
  );
}

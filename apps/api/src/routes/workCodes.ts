import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { workCodes } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';

const createBody = z.object({
  code: z.string().min(1),
  description: z.string().optional(),
  requiredPhotoCount: z.number().int().min(3).default(3),
});

const updateBody = z.object({
  code: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  requiredPhotoCount: z.number().int().min(3).optional(),
  active: z.boolean().optional(),
});

const UNIQUE_VIOLATION = '23505';

/**
 * GET is available to any active user (needed by the technician mobile
 * form's work-code picker); app_admin sees inactive codes too, so they can
 * be re-activated. Write endpoints are app_admin-only config work (Phase 5).
 */
export async function workCodeRoutes(app: FastifyInstance) {
  app.get('/work-codes', { preHandler: [authenticate, requireActiveUser] }, async (request) => {
    const includeInactive = request.currentUser!.role === 'app_admin';
    return app.db
      .select()
      .from(workCodes)
      .where(includeInactive ? undefined : eq(workCodes.active, true))
      .orderBy(asc(workCodes.code));
  });

  const adminGuards = [authenticate, requireActiveUser, requireRole(['app_admin'])];

  app.post('/work-codes', { preHandler: adminGuards }, async (request, reply) => {
    const body = createBody.parse(request.body);
    try {
      const [created] = await app.db.insert(workCodes).values(body).returning();
      return reply.code(201).send(created);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        return reply.code(409).send({ error: 'work_code_already_exists' });
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string } }>('/work-codes/:id', { preHandler: adminGuards }, async (request, reply) => {
    const body = updateBody.parse(request.body);
    if (Object.keys(body).length === 0) {
      return reply.code(400).send({ error: 'no_fields_to_update' });
    }
    try {
      const [updated] = await app.db
        .update(workCodes)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(workCodes.id, request.params.id))
        .returning();
      if (!updated) {
        return reply.code(404).send({ error: 'work_code_not_found' });
      }
      return reply.send(updated);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        return reply.code(409).send({ error: 'work_code_already_exists' });
      }
      throw err;
    }
  });
}

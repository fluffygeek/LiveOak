import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { users } from '@liveoak/db';
import { userRoleSchema } from '@liveoak/shared-types';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';

const createUserBody = z.object({
  email: z.string().email(),
  role: userRoleSchema,
  displayName: z.string().optional(),
});

const updateUserBody = z.object({
  role: userRoleSchema.optional(),
  active: z.boolean().optional(),
  displayName: z.string().optional(),
});

const UNIQUE_VIOLATION = '23505';

/**
 * App-admin-only user provisioning. There is no self-registration path —
 * a Gmail address must be added here (with a role) before that person can
 * sign in via /auth/google.
 */
export async function userRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireActiveUser, requireRole(['app_admin'])];

  app.get('/users', { preHandler: guards }, async () => {
    return app.db.select().from(users);
  });

  app.post('/users', { preHandler: guards }, async (request, reply) => {
    const body = createUserBody.parse(request.body);

    try {
      const [created] = await app.db
        .insert(users)
        .values({
          email: body.email,
          role: body.role,
          displayName: body.displayName,
          createdBy: request.currentUser!.id,
        })
        .returning();
      return reply.code(201).send(created);
    } catch (err) {
      // Catching the unique-violation from the insert (rather than a
      // pre-check select) avoids a TOCTOU race between two concurrent
      // requests for the same email.
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        return reply.code(409).send({ error: 'user_already_exists' });
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string } }>('/users/:id', { preHandler: guards }, async (request, reply) => {
    const body = updateUserBody.parse(request.body);
    if (Object.keys(body).length === 0) {
      return reply.code(400).send({ error: 'no_fields_to_update' });
    }

    const [target] = await app.db.select().from(users).where(eq(users.id, request.params.id));
    if (!target) {
      return reply.code(404).send({ error: 'user_not_found' });
    }

    const willStillBeActiveAppAdmin =
      (body.role ?? target.role) === 'app_admin' && (body.active ?? target.active);
    const wasActiveAppAdmin = target.role === 'app_admin' && target.active;

    if (wasActiveAppAdmin && !willStillBeActiveAppAdmin) {
      const otherActiveAdmins = await app.db
        .select()
        .from(users)
        .where(and(eq(users.role, 'app_admin'), eq(users.active, true), ne(users.id, target.id)));
      if (otherActiveAdmins.length === 0) {
        return reply.code(409).send({ error: 'cannot_remove_last_app_admin' });
      }
    }

    const [updated] = await app.db
      .update(users)
      .set(body)
      .where(eq(users.id, request.params.id))
      .returning();

    return reply.send(updated);
  });
}

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

// Guards against a malformed :id reaching `eq(users.id, id)` and failing
// with a raw Postgres error (reported as an opaque 500) instead of a 400.
const userIdParams = z.object({ id: z.string().uuid() });

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
    const { id } = userIdParams.parse(request.params);
    const body = updateUserBody.parse(request.body);
    if (Object.keys(body).length === 0) {
      return reply.code(400).send({ error: 'no_fields_to_update' });
    }

    // The read-check-write for the last-admin guard runs inside a
    // transaction with row locks (FOR UPDATE) so two concurrent PATCH
    // requests demoting two different admins can't both observe "one
    // other admin remains" and both commit, leaving zero active app_admins.
    const result = await app.db.transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!target) {
        return { status: 404 as const, body: { error: 'user_not_found' } };
      }

      const willStillBeActiveAppAdmin =
        (body.role ?? target.role) === 'app_admin' && (body.active ?? target.active);
      const wasActiveAppAdmin = target.role === 'app_admin' && target.active;

      if (wasActiveAppAdmin && !willStillBeActiveAppAdmin) {
        const otherActiveAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'app_admin'), eq(users.active, true), ne(users.id, target.id)))
          .for('update')
          .limit(1);
        if (otherActiveAdmins.length === 0) {
          return { status: 409 as const, body: { error: 'cannot_remove_last_app_admin' } };
        }
      }

      const [updated] = await tx.update(users).set(body).where(eq(users.id, id)).returning();
      return { status: 200 as const, body: updated };
    });

    return reply.code(result.status).send(result.body);
  });
}

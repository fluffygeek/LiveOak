import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
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

    const [existing] = await app.db.select().from(users).where(eq(users.email, body.email));
    if (existing) {
      return reply.code(409).send({ error: 'user_already_exists' });
    }

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
  });

  app.patch<{ Params: { id: string } }>('/users/:id', { preHandler: guards }, async (request, reply) => {
    const body = updateUserBody.parse(request.body);
    if (Object.keys(body).length === 0) {
      return reply.code(400).send({ error: 'no_fields_to_update' });
    }

    const [updated] = await app.db
      .update(users)
      .set(body)
      .where(eq(users.id, request.params.id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: 'user_not_found' });
    }
    return reply.send(updated);
  });
}

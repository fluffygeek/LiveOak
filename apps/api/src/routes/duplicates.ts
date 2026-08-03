import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { jobs, duplicateLinks, auditLog } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';

const resolveBody = z.object({
  jobIds: z.array(z.string().uuid()).min(1),
});

/**
 * Payroll admin (+ app_admin) duplicate review queue: groups produced by the
 * worker's nightly reconciliation job (apps/worker/src/jobs/reconcileDuplicates.ts).
 * See design plan §5 (admin web flow) and §3 (API surface).
 */
export async function duplicateRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireActiveUser, requireRole(['payroll_admin'])];

  app.get('/jobs/duplicates', { preHandler: guards }, async (_request, reply) => {
    const rows = await app.db
      .select()
      .from(jobs)
      .where(isNotNull(jobs.duplicateGroupId))
      .orderBy(asc(jobs.duplicateGroupId), asc(jobs.submittedAt));

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const groupId = row.duplicateGroupId!;
      const group = groups.get(groupId);
      if (group) group.push(row);
      else groups.set(groupId, [row]);
    }

    return reply.send({
      groups: [...groups.entries()].map(([duplicateGroupId, groupJobs]) => ({ duplicateGroupId, jobs: groupJobs })),
    });
  });

  app.post<{ Params: { groupId: string } }>(
    '/jobs/duplicates/:groupId/resolve',
    { preHandler: guards },
    async (request, reply) => {
      const body = resolveBody.parse(request.body);
      const groupId = request.params.groupId;

      const updated = await app.db.transaction(async (tx) => {
        const members = await tx
          .select()
          .from(jobs)
          .where(eq(jobs.duplicateGroupId, groupId))
          .for('update');
        if (members.length === 0) return null;

        const memberIds = new Set(members.map((m) => m.id));
        const invalidIds = body.jobIds.filter((id) => !memberIds.has(id));
        if (invalidIds.length > 0) {
          return { error: 'job_not_in_group' as const, invalidIds };
        }

        const remaining = members.filter((m) => !body.jobIds.includes(m.id));
        // A "duplicate group" of one no longer means anything — cascade the unlink.
        const toUnlink = remaining.length === 1 ? members.map((m) => m.id) : body.jobIds;

        for (const jobId of toUnlink) {
          const member = members.find((m) => m.id === jobId)!;
          await tx
            .update(jobs)
            .set({ isDuplicate: false, duplicateGroupId: null, updatedAt: new Date() })
            .where(and(eq(jobs.id, jobId), eq(jobs.state, member.state)));

          await tx.insert(auditLog).values({
            jobId: member.id,
            jobState: member.state,
            actorId: request.currentUser!.id,
            action: 'field_updated',
            fieldName: 'is_duplicate',
            oldValue: true,
            newValue: false,
          });
        }

        await tx.delete(duplicateLinks).where(and(eq(duplicateLinks.duplicateGroupId, groupId), inArray(duplicateLinks.jobId, toUnlink)));

        return { unlinked: toUnlink };
      });

      if (!updated) {
        return reply.code(404).send({ error: 'duplicate_group_not_found' });
      }
      if ('error' in updated) {
        return reply.code(400).send(updated);
      }
      return reply.send(updated);
    },
  );
}

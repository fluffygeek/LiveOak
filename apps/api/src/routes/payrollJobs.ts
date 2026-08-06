import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, count, desc, eq, gte, lte, SQL } from 'drizzle-orm';
import { jobs, jobPhotos, auditLog, users, discrepancyReasons } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';
import { createPhotoDownloadUrl } from '../lib/s3.js';
import { recordFieldDiffs, recordAction } from '../lib/audit.js';

// `state` is intentionally excluded: it is the jobs table's list-partition
// key (part of the composite PK (id, state)) and must never be admin-editable.
const EDITABLE_FIELDS = [
  'jobNumber',
  'workCodeId',
  'footage',
  'notes',
  'addressLine1',
  'addressLine2',
  'city',
  'zip',
  'isNewBuild',
] as const;

const jobPatchBody = z.object({
  jobNumber: z.string().min(1).optional(),
  workCodeId: z.string().uuid().optional(),
  footage: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
  addressLine1: z.string().min(1).optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().min(1).optional(),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/)
    .optional(),
  isNewBuild: z.boolean().optional(),
});

const optionalBoolString = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const listQuery = z.object({
  state: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
    .optional(),
  technicianId: z.string().uuid().optional(),
  workCodeId: z.string().uuid().optional(),
  status: z.enum(['submitted', 'closed', 'pictures_downloaded']).optional(),
  isDiscrepancy: optionalBoolString,
  isDuplicate: optionalBoolString,
  submittedFrom: z.coerce.date().optional(),
  submittedTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

const statusBody = z.object({
  status: z.enum(['submitted', 'closed', 'pictures_downloaded']),
});

const discrepancyBody = z.object({
  discrepancyReasonId: z.string().uuid(),
  discrepancyNotes: z.string().optional(),
});

// Without this, a malformed :id (not a UUID) reaches `eq(jobs.id, id)` and
// fails with a raw Postgres 22P02 error — indistinguishable from a real
// server error to the global handler, so it becomes a 500 instead of a 400.
const jobIdParams = z.object({ id: z.string().uuid() });

/**
 * Payroll admin (and app_admin, via the requireRole superset) record
 * management: list/filter/search, view, edit any field, mark
 * closed/pictures-downloaded, flag/clear discrepancies, and view the audit
 * trail. See the design plan's API surface and admin web flow (§3, §5).
 */
export async function payrollJobRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireActiveUser, requireRole(['payroll_admin'])];

  app.get('/jobs', { preHandler: guards }, async (request, reply) => {
    const query = listQuery.parse(request.query);
    const conditions: SQL[] = [];
    if (query.state) conditions.push(eq(jobs.state, query.state));
    if (query.technicianId) conditions.push(eq(jobs.technicianId, query.technicianId));
    if (query.workCodeId) conditions.push(eq(jobs.workCodeId, query.workCodeId));
    if (query.status) conditions.push(eq(jobs.status, query.status));
    if (query.isDiscrepancy !== undefined) conditions.push(eq(jobs.isDiscrepancy, query.isDiscrepancy));
    if (query.isDuplicate !== undefined) conditions.push(eq(jobs.isDuplicate, query.isDuplicate));
    if (query.submittedFrom) conditions.push(gte(jobs.submittedAt, query.submittedFrom));
    if (query.submittedTo) conditions.push(lte(jobs.submittedAt, query.submittedTo));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      app.db
        .select()
        .from(jobs)
        .where(where)
        .orderBy(desc(jobs.submittedAt))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      app.db.select({ total: count() }).from(jobs).where(where),
    ]);
    const total = totalRows[0]?.total ?? 0;

    return reply.send({ jobs: rows, page: query.page, perPage: query.perPage, total });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', { preHandler: guards }, async (request, reply) => {
    const { id } = jobIdParams.parse(request.params);
    const [job] = await app.db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) {
      return reply.code(404).send({ error: 'job_not_found' });
    }
    const photos = await app.db
      .select()
      .from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, job.id), eq(jobPhotos.jobState, job.state)));
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => ({
        ...photo,
        downloadUrl: app.env.S3_BUCKET ? await createPhotoDownloadUrl(app.s3, app.env.S3_BUCKET, photo.s3Key) : null,
      })),
    );
    return reply.send({ ...job, photos: photosWithUrls });
  });

  app.patch<{ Params: { id: string } }>('/jobs/:id', { preHandler: guards }, async (request, reply) => {
    const { id } = jobIdParams.parse(request.params);
    const body = jobPatchBody.parse(request.body);
    if (Object.keys(body).length === 0) {
      return reply.code(400).send({ error: 'no_fields_to_update' });
    }

    const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.footage !== undefined) {
      updates.footage = String(body.footage);
    }

    const updated = await app.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
      if (!existing) return null;

      const [row] = await tx
        .update(jobs)
        .set(updates)
        .where(and(eq(jobs.id, existing.id), eq(jobs.state, existing.state)))
        .returning();
      if (!row) throw new Error('Failed to update job record');

      await recordFieldDiffs(tx, {
        jobId: row.id,
        jobState: row.state,
        actorId: request.currentUser!.id,
        oldRow: existing,
        newRow: row,
        fields: EDITABLE_FIELDS,
      });

      return row;
    });

    if (!updated) {
      return reply.code(404).send({ error: 'job_not_found' });
    }
    return reply.send(updated);
  });

  app.post<{ Params: { id: string } }>('/jobs/:id/status', { preHandler: guards }, async (request, reply) => {
    const { id } = jobIdParams.parse(request.params);
    const body = statusBody.parse(request.body);

    const updated = await app.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
      if (!existing) return null;

      const [row] = await tx
        .update(jobs)
        .set({ status: body.status, updatedAt: new Date() })
        .where(and(eq(jobs.id, existing.id), eq(jobs.state, existing.state)))
        .returning();
      if (!row) throw new Error('Failed to update job status');

      await recordAction(tx, {
        jobId: row.id,
        jobState: row.state,
        actorId: request.currentUser!.id,
        action: body.status === 'pictures_downloaded' ? 'photos_downloaded' : 'status_changed',
        fieldName: 'status',
        oldValue: existing.status,
        newValue: row.status,
      });

      return row;
    });

    if (!updated) {
      return reply.code(404).send({ error: 'job_not_found' });
    }
    return reply.send(updated);
  });

  app.post<{ Params: { id: string } }>('/jobs/:id/discrepancy', { preHandler: guards }, async (request, reply) => {
    const { id } = jobIdParams.parse(request.params);
    const body = discrepancyBody.parse(request.body);
    const [reason] = await app.db
      .select()
      .from(discrepancyReasons)
      .where(eq(discrepancyReasons.id, body.discrepancyReasonId));
    if (!reason) {
      return reply.code(400).send({ error: 'invalid_discrepancy_reason' });
    }

    const updated = await app.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
      if (!existing) return null;

      const [row] = await tx
        .update(jobs)
        .set({
          isDiscrepancy: true,
          discrepancyReasonId: body.discrepancyReasonId,
          discrepancyNotes: body.discrepancyNotes ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, existing.id), eq(jobs.state, existing.state)))
        .returning();
      if (!row) throw new Error('Failed to flag discrepancy');

      await recordAction(tx, {
        jobId: row.id,
        jobState: row.state,
        actorId: request.currentUser!.id,
        action: 'marked_discrepancy',
        fieldName: 'discrepancy_reason_id',
        oldValue: existing.discrepancyReasonId,
        newValue: row.discrepancyReasonId,
      });

      return row;
    });

    if (!updated) {
      return reply.code(404).send({ error: 'job_not_found' });
    }
    return reply.send(updated);
  });

  app.delete<{ Params: { id: string } }>('/jobs/:id/discrepancy', { preHandler: guards }, async (request, reply) => {
    const { id } = jobIdParams.parse(request.params);
    const updated = await app.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
      if (!existing) return null;

      const [row] = await tx
        .update(jobs)
        .set({ isDiscrepancy: false, discrepancyReasonId: null, discrepancyNotes: null, updatedAt: new Date() })
        .where(and(eq(jobs.id, existing.id), eq(jobs.state, existing.state)))
        .returning();
      if (!row) throw new Error('Failed to clear discrepancy');

      await recordAction(tx, {
        jobId: row.id,
        jobState: row.state,
        actorId: request.currentUser!.id,
        action: 'cleared_discrepancy',
        fieldName: 'discrepancy_reason_id',
        oldValue: existing.discrepancyReasonId,
        newValue: null,
      });

      return row;
    });

    if (!updated) {
      return reply.code(404).send({ error: 'job_not_found' });
    }
    return reply.send(updated);
  });

  app.get<{ Params: { id: string } }>('/jobs/:id/audit-log', { preHandler: guards }, async (request, reply) => {
    const { id } = jobIdParams.parse(request.params);
    const rows = await app.db
      .select({
        id: auditLog.id,
        jobId: auditLog.jobId,
        actorId: auditLog.actorId,
        actorEmail: users.email,
        actorDisplayName: users.displayName,
        action: auditLog.action,
        fieldName: auditLog.fieldName,
        oldValue: auditLog.oldValue,
        newValue: auditLog.newValue,
        occurredAt: auditLog.occurredAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.actorId, users.id))
      .where(eq(auditLog.jobId, id))
      .orderBy(desc(auditLog.occurredAt));

    return reply.send(rows);
  });
}

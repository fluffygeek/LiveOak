import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { jobDrafts, jobDraftPhotos, jobs, jobPhotos, workCodes, auditLog } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';
import { createPhotoUploadUrl } from '../lib/s3.js';
import { verifyAddressWithUsps } from '../lib/usps.js';

const draftPatchBody = z.object({
  jobNumber: z.string().min(1).optional(),
  workCodeId: z.string().uuid().optional(),
  footage: z.number().positive().optional(),
  notes: z.string().optional(),
  isNewBuild: z.boolean().optional(),
  addressLine1: z.string().min(1).optional(),
  addressLine2: z.string().optional(),
  city: z.string().min(1).optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/)
    .optional(),
});

const presignBody = z.object({
  contentType: z.string().min(1),
});

const confirmPhotoBody = z.object({
  key: z.string().min(1),
  contentType: z.string().min(1),
});

const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'city', 'state', 'zip', 'isNewBuild'] as const;

function touchesAddress(body: Record<string, unknown>): boolean {
  return ADDRESS_FIELDS.some((field) => field in body);
}

const SUBMITTABLE_VERIFICATION_STATUSES = ['verified', 'skipped_new_build', 'unavailable'] as const;

/**
 * Technician job-draft lifecycle: create/resume the single in-progress
 * draft, edit it, attach photos, verify the address, and submit — at which
 * point it becomes an immutable row in the partitioned `jobs` table. See
 * the mobile flow diagram in the design plan (§4).
 */
export async function jobDraftRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireActiveUser, requireRole(['technician'])];

  async function loadOwnedDraft(technicianId: string, draftId: string) {
    const [draft] = await app.db
      .select()
      .from(jobDrafts)
      .where(and(eq(jobDrafts.id, draftId), eq(jobDrafts.technicianId, technicianId)));
    return draft;
  }

  // Idempotent: returns the technician's existing draft if one is open,
  // otherwise creates a new (empty) one. The unique index on technician_id
  // in job_drafts is what actually enforces "one draft at a time".
  app.post('/jobs/draft', { preHandler: guards }, async (request, reply) => {
    const technicianId = request.currentUser!.id;
    const [existing] = await app.db.select().from(jobDrafts).where(eq(jobDrafts.technicianId, technicianId));
    if (existing) {
      return reply.send(existing);
    }
    const [created] = await app.db.insert(jobDrafts).values({ technicianId }).returning();
    return reply.code(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/jobs/draft/:id', { preHandler: guards }, async (request, reply) => {
    const body = draftPatchBody.parse(request.body);
    const draft = await loadOwnedDraft(request.currentUser!.id, request.params.id);
    if (!draft) {
      return reply.code(404).send({ error: 'draft_not_found' });
    }

    const updates: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (touchesAddress(body)) {
      // Any address-affecting edit invalidates a prior verification result —
      // the client must call verify-address again before submitting.
      updates.addressVerificationStatus = 'pending';
      updates.verifiedAddressLine1 = null;
      updates.verifiedCity = null;
      updates.verifiedState = null;
      updates.verifiedZip = null;
      updates.verifiedZip4 = null;
      updates.addressVerificationCheckedAt = null;
    }
    if (body.footage !== undefined) {
      updates.footage = String(body.footage);
    }

    const [updated] = await app.db.update(jobDrafts).set(updates).where(eq(jobDrafts.id, draft.id)).returning();
    return reply.send(updated);
  });

  // Self-service discard, per design plan §10 item 2.
  app.delete<{ Params: { id: string } }>('/jobs/draft/:id', { preHandler: guards }, async (request, reply) => {
    const draft = await loadOwnedDraft(request.currentUser!.id, request.params.id);
    if (!draft) {
      return reply.code(404).send({ error: 'draft_not_found' });
    }
    await app.db.delete(jobDrafts).where(eq(jobDrafts.id, draft.id));
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/jobs/draft/:id/photos', { preHandler: guards }, async (request, reply) => {
    const draft = await loadOwnedDraft(request.currentUser!.id, request.params.id);
    if (!draft) {
      return reply.code(404).send({ error: 'draft_not_found' });
    }
    const photos = await app.db.select().from(jobDraftPhotos).where(eq(jobDraftPhotos.draftId, draft.id));
    return reply.send(photos);
  });

  app.post<{ Params: { id: string } }>(
    '/jobs/draft/:id/photos/presign',
    { preHandler: guards },
    async (request, reply) => {
      const body = presignBody.parse(request.body);
      const draft = await loadOwnedDraft(request.currentUser!.id, request.params.id);
      if (!draft) {
        return reply.code(404).send({ error: 'draft_not_found' });
      }
      if (!app.env.S3_BUCKET) {
        return reply.code(500).send({ error: 'photo_storage_not_configured' });
      }
      const { key, uploadUrl } = await createPhotoUploadUrl(app.s3, app.env.S3_BUCKET, draft.id, body.contentType);
      return reply.send({ key, uploadUrl });
    },
  );

  // Called by the client after the direct-to-S3 PUT succeeds, to register
  // the photo against the draft.
  app.post<{ Params: { id: string } }>(
    '/jobs/draft/:id/photos/confirm',
    { preHandler: guards },
    async (request, reply) => {
      const body = confirmPhotoBody.parse(request.body);
      const draft = await loadOwnedDraft(request.currentUser!.id, request.params.id);
      if (!draft) {
        return reply.code(404).send({ error: 'draft_not_found' });
      }
      const [photo] = await app.db
        .insert(jobDraftPhotos)
        .values({ draftId: draft.id, s3Key: body.key, contentType: body.contentType })
        .returning();
      return reply.code(201).send(photo);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/jobs/draft/:id/verify-address',
    { preHandler: guards },
    async (request, reply) => {
      const draft = await loadOwnedDraft(request.currentUser!.id, request.params.id);
      if (!draft) {
        return reply.code(404).send({ error: 'draft_not_found' });
      }
      if (!draft.addressLine1 || !draft.city || !draft.state || !draft.zip) {
        return reply.code(400).send({ error: 'incomplete_address' });
      }

      if (draft.isNewBuild) {
        const [updated] = await app.db
          .update(jobDrafts)
          .set({ addressVerificationStatus: 'skipped_new_build', addressVerificationCheckedAt: new Date() })
          .where(eq(jobDrafts.id, draft.id))
          .returning();
        return reply.send(updated);
      }

      const result = await verifyAddressWithUsps(app.env, {
        addressLine1: draft.addressLine1,
        addressLine2: draft.addressLine2,
        city: draft.city,
        state: draft.state,
        zip: draft.zip,
      });

      const [updated] = await app.db
        .update(jobDrafts)
        .set({
          addressVerificationStatus: result.status,
          addressVerificationCheckedAt: new Date(),
          verifiedAddressLine1: result.normalized?.addressLine1 ?? null,
          verifiedCity: result.normalized?.city ?? null,
          verifiedState: result.normalized?.state ?? null,
          verifiedZip: result.normalized?.zip ?? null,
          verifiedZip4: result.normalized?.zip4 ?? null,
        })
        .where(eq(jobDrafts.id, draft.id))
        .returning();
      return reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>('/jobs/draft/:id/submit', { preHandler: guards }, async (request, reply) => {
    const draft = await loadOwnedDraft(request.currentUser!.id, request.params.id);
    if (!draft) {
      return reply.code(404).send({ error: 'draft_not_found' });
    }

    if (
      !draft.jobNumber ||
      !draft.workCodeId ||
      !draft.footage ||
      !draft.addressLine1 ||
      !draft.city ||
      !draft.state ||
      !/^[A-Z]{2}$/.test(draft.state) ||
      !draft.zip
    ) {
      return reply.code(400).send({ error: 'incomplete_draft' });
    }

    if (!SUBMITTABLE_VERIFICATION_STATUSES.includes(draft.addressVerificationStatus as never)) {
      return reply.code(400).send({ error: 'address_not_verified' });
    }

    const [workCode] = await app.db.select().from(workCodes).where(eq(workCodes.id, draft.workCodeId));
    if (!workCode || !workCode.active) {
      return reply.code(400).send({ error: 'invalid_work_code' });
    }

    const photos = await app.db.select().from(jobDraftPhotos).where(eq(jobDraftPhotos.draftId, draft.id));
    if (photos.length < workCode.requiredPhotoCount) {
      return reply.code(400).send({
        error: 'insufficient_photos',
        required: workCode.requiredPhotoCount,
        uploaded: photos.length,
      });
    }

    const created = await app.db.transaction(async (tx) => {
      const [job] = await tx
        .insert(jobs)
        .values({
          state: draft.state as string,
          jobNumber: draft.jobNumber as string,
          technicianId: draft.technicianId,
          workCodeId: draft.workCodeId as string,
          footage: draft.footage as string,
          notes: draft.notes,
          addressLine1: draft.addressLine1 as string,
          addressLine2: draft.addressLine2,
          city: draft.city as string,
          zip: draft.zip as string,
          isNewBuild: draft.isNewBuild,
          verifiedAddressLine1: draft.verifiedAddressLine1,
          verifiedCity: draft.verifiedCity,
          verifiedState: draft.verifiedState,
          verifiedZip: draft.verifiedZip,
          verifiedZip4: draft.verifiedZip4,
          addressVerificationStatus: draft.addressVerificationStatus,
          addressVerificationCheckedAt: draft.addressVerificationCheckedAt,
        })
        .returning();
      if (!job) {
        throw new Error('Failed to insert job record');
      }

      if (photos.length > 0) {
        await tx.insert(jobPhotos).values(
          photos.map((photo) => ({
            jobId: job.id,
            jobState: job.state,
            s3Key: photo.s3Key,
            contentType: photo.contentType,
            uploadedAt: photo.uploadedAt,
          })),
        );
      }

      await tx.insert(auditLog).values({
        jobId: job.id,
        jobState: job.state,
        actorId: request.currentUser!.id,
        action: 'submitted',
      });

      // Cascades to job_draft_photos.
      await tx.delete(jobDrafts).where(eq(jobDrafts.id, draft.id));

      return job;
    });

    return reply.code(201).send(created);
  });
}

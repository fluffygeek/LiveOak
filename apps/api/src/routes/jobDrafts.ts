import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { jobDrafts, jobDraftPhotos, jobs, jobPhotos, workCodes, auditLog } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';
import { createPhotoUploadUrl, isAllowedPhotoContentType, objectExists } from '../lib/s3.js';
import { verifyAddressWithUsps } from '@liveoak/usps';

const UNIQUE_VIOLATION = '23505';

const draftPatchBody = z.object({
  jobNumber: z.string().min(1).optional(),
  workCodeId: z.string().uuid().optional(),
  // null explicitly clears a previously-set value; omitted leaves it untouched.
  footage: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  isNewBuild: z.boolean().optional(),
  addressLine1: z.string().min(1).optional(),
  addressLine2: z.string().nullable().optional(),
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

// Path params are attacker-controlled free text until validated — an
// id that isn't a well-formed UUID would otherwise reach a `eq(column, id)`
// query against a uuid column and fail with a raw Postgres 22P02 error,
// which the global error handler can't distinguish from a real server
// error and reports as a 500 instead of the 400 this actually is.
const draftIdParams = z.object({ id: z.string().uuid() });

const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'city', 'state', 'zip', 'isNewBuild'] as const;

function touchesAddress(body: Record<string, unknown>): boolean {
  return ADDRESS_FIELDS.some((field) => field in body);
}

const SUBMITTABLE_VERIFICATION_STATUSES = ['verified', 'skipped_new_build', 'unavailable'] as const;
type SubmittableStatus = (typeof SUBMITTABLE_VERIFICATION_STATUSES)[number];

function isSubmittableStatus(status: string | null): status is SubmittableStatus {
  return (SUBMITTABLE_VERIFICATION_STATUSES as readonly string[]).includes(status ?? '');
}

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
  // in job_drafts is what actually enforces "one draft at a time"; the
  // catch below handles two concurrent creates racing that constraint.
  app.post('/jobs/draft', { preHandler: guards }, async (request, reply) => {
    const technicianId = request.currentUser!.id;
    const [existing] = await app.db.select().from(jobDrafts).where(eq(jobDrafts.technicianId, technicianId));
    if (existing) {
      return reply.send(existing);
    }
    try {
      const [created] = await app.db.insert(jobDrafts).values({ technicianId }).returning();
      return reply.code(201).send(created);
    } catch (err) {
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      // Lost the race against a concurrent create — return the winner's draft.
      const [draft] = await app.db.select().from(jobDrafts).where(eq(jobDrafts.technicianId, technicianId));
      return reply.send(draft);
    }
  });

  app.patch<{ Params: { id: string } }>('/jobs/draft/:id', { preHandler: guards }, async (request, reply) => {
    const { id } = draftIdParams.parse(request.params);
    const body = draftPatchBody.parse(request.body);
    const draft = await loadOwnedDraft(request.currentUser!.id, id);
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
      updates.footage = body.footage === null ? null : String(body.footage);
    }

    const [updated] = await app.db.update(jobDrafts).set(updates).where(eq(jobDrafts.id, draft.id)).returning();
    return reply.send(updated);
  });

  // Self-service discard, per design plan §10 item 2.
  app.delete<{ Params: { id: string } }>('/jobs/draft/:id', { preHandler: guards }, async (request, reply) => {
    const { id } = draftIdParams.parse(request.params);
    const draft = await loadOwnedDraft(request.currentUser!.id, id);
    if (!draft) {
      return reply.code(404).send({ error: 'draft_not_found' });
    }
    await app.db.delete(jobDrafts).where(eq(jobDrafts.id, draft.id));
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/jobs/draft/:id/photos', { preHandler: guards }, async (request, reply) => {
    const { id } = draftIdParams.parse(request.params);
    const draft = await loadOwnedDraft(request.currentUser!.id, id);
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
      const { id } = draftIdParams.parse(request.params);
      const body = presignBody.parse(request.body);
      if (!isAllowedPhotoContentType(body.contentType)) {
        return reply.code(400).send({ error: 'unsupported_content_type' });
      }
      const draft = await loadOwnedDraft(request.currentUser!.id, id);
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
  // the photo against the draft. The key must be one this API presigned for
  // this draft, and the object must actually exist in the bucket — otherwise
  // a technician could report a fabricated or another draft's key to satisfy
  // the required-photo-count gate at submit time without uploading anything.
  app.post<{ Params: { id: string } }>(
    '/jobs/draft/:id/photos/confirm',
    { preHandler: guards },
    async (request, reply) => {
      const { id } = draftIdParams.parse(request.params);
      const body = confirmPhotoBody.parse(request.body);
      const draft = await loadOwnedDraft(request.currentUser!.id, id);
      if (!draft) {
        return reply.code(404).send({ error: 'draft_not_found' });
      }
      if (!body.key.startsWith(`job-photos/${draft.id}/`)) {
        return reply.code(400).send({ error: 'invalid_photo_key' });
      }
      if (!app.env.S3_BUCKET) {
        return reply.code(500).send({ error: 'photo_storage_not_configured' });
      }
      if (!(await objectExists(app.s3, app.env.S3_BUCKET, body.key))) {
        return reply.code(400).send({ error: 'photo_not_uploaded' });
      }
      try {
        const [photo] = await app.db
          .insert(jobDraftPhotos)
          .values({ draftId: draft.id, s3Key: body.key, contentType: body.contentType })
          .returning();
        return reply.code(201).send(photo);
      } catch (err) {
        // s3Key is unique. A client retry (network blip after the first
        // confirm actually succeeded) would otherwise hit a raw Postgres
        // unique-violation and get an opaque 500 — make the endpoint
        // idempotent instead by returning the already-registered row.
        if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
        const [existing] = await app.db.select().from(jobDraftPhotos).where(eq(jobDraftPhotos.s3Key, body.key));
        if (existing && existing.draftId === draft.id) {
          return reply.code(200).send(existing);
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/jobs/draft/:id/verify-address',
    { preHandler: guards },
    async (request, reply) => {
      const { id } = draftIdParams.parse(request.params);
      const draft = await loadOwnedDraft(request.currentUser!.id, id);
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
    const technicianId = request.currentUser!.id;
    const { id: draftId } = draftIdParams.parse(request.params);

    // Pre-transaction checks give fast, specific error responses for the
    // common case (incomplete form, missing photos). The transaction below
    // re-validates everything against a row lock so two concurrent submits
    // of the same draft (a double-tap or a client retry) can't both finalize
    // a job — the second one finds the draft already gone and gets a 409.
    const draft = await loadOwnedDraft(technicianId, draftId);
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

    if (!isSubmittableStatus(draft.addressVerificationStatus)) {
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
      // Lock the draft row and re-read it: if a concurrent submit already
      // deleted it, this returns nothing and we abort instead of inserting
      // a duplicate job.
      const [locked] = await tx
        .select()
        .from(jobDrafts)
        .where(and(eq(jobDrafts.id, draftId), eq(jobDrafts.technicianId, technicianId)))
        .for('update');
      if (!locked) {
        return null;
      }

      const [job] = await tx
        .insert(jobs)
        .values({
          state: locked.state as string,
          jobNumber: locked.jobNumber as string,
          technicianId: locked.technicianId,
          workCodeId: locked.workCodeId as string,
          footage: locked.footage as string,
          notes: locked.notes,
          addressLine1: locked.addressLine1 as string,
          addressLine2: locked.addressLine2,
          city: locked.city as string,
          zip: locked.zip as string,
          isNewBuild: locked.isNewBuild,
          verifiedAddressLine1: locked.verifiedAddressLine1,
          verifiedCity: locked.verifiedCity,
          verifiedState: locked.verifiedState,
          verifiedZip: locked.verifiedZip,
          verifiedZip4: locked.verifiedZip4,
          addressVerificationStatus: locked.addressVerificationStatus,
          addressVerificationCheckedAt: locked.addressVerificationCheckedAt,
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
        actorId: technicianId,
        action: 'submitted',
      });

      // Cascades to job_draft_photos.
      await tx.delete(jobDrafts).where(eq(jobDrafts.id, locked.id));

      return job;
    });

    if (!created) {
      return reply.code(409).send({ error: 'already_submitted' });
    }

    return reply.code(201).send(created);
  });
}

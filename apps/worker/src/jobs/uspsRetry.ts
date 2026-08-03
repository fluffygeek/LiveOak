import { and, asc, eq } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { verifyAddressWithUsps } from '@liveoak/usps';
import { jobs, auditLog, SYSTEM_USER_ID, type Db } from '@liveoak/db';
import type { Env } from '../env.js';
import { logger } from '../lib/logger.js';

// Caps how many records one run re-verifies, so a large backlog after a
// prolonged USPS outage doesn't turn an hourly job into an hours-long one.
const BATCH_LIMIT = 50;

/**
 * Hourly retry (see apps/worker/src/index.ts's schedule): re-attempts USPS
 * verification for jobs stuck `address_verification_status = 'unavailable'`
 * after an outage or missing-credentials window, so payroll admins aren't
 * stuck manually re-checking every one. A `verified`/`failed` result updates
 * the job in place; still-`unavailable` results are left for the next run.
 */
export async function retryUspsVerification(db: Db, env: Env, _job: Job): Promise<void> {
  if (!env.USPS_CLIENT_ID || !env.USPS_CLIENT_SECRET) {
    logger.warn('retryUspsVerification: USPS_CLIENT_ID/USPS_CLIENT_SECRET not configured, skipping run.');
    return;
  }

  const stuck = await db
    .select()
    .from(jobs)
    .where(eq(jobs.addressVerificationStatus, 'unavailable'))
    // Oldest-checked (or never-checked) first, so the same subset can't get
    // starved indefinitely by always landing past the BATCH_LIMIT cutoff.
    .orderBy(asc(jobs.addressVerificationCheckedAt))
    .limit(BATCH_LIMIT);

  for (const row of stuck) {
    const result = await verifyAddressWithUsps(env, {
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      zip: row.zip,
    });

    if (result.status === 'unavailable') continue;

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(jobs)
        .set({
          addressVerificationStatus: result.status,
          addressVerificationCheckedAt: new Date(),
          verifiedAddressLine1: result.normalized?.addressLine1 ?? null,
          verifiedCity: result.normalized?.city ?? null,
          verifiedState: result.normalized?.state ?? null,
          verifiedZip: result.normalized?.zip ?? null,
          verifiedZip4: result.normalized?.zip4 ?? null,
          updatedAt: new Date(),
        })
        // Guards against a concurrent payroll-admin edit or a previous
        // retry run already having moved this job off `unavailable`.
        .where(and(eq(jobs.id, row.id), eq(jobs.state, row.state), eq(jobs.addressVerificationStatus, 'unavailable')))
        .returning();
      if (!updated) return;

      await tx.insert(auditLog).values({
        jobId: updated.id,
        jobState: updated.state,
        actorId: SYSTEM_USER_ID,
        action: 'field_updated',
        fieldName: 'address_verification_status',
        oldValue: 'unavailable',
        newValue: result.status,
      });
    });
  }
}

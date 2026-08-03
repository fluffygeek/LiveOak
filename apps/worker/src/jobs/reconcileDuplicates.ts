import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { jobs, duplicateLinks, auditLog, SYSTEM_USER_ID, type Db } from '@liveoak/db';

/** Collapses whitespace/punctuation so trivial formatting differences don't defeat matching. */
function normalizePart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}

interface JobRow {
  id: string;
  state: string;
  addressLine1: string;
  city: string;
  zip: string;
  verifiedAddressLine1: string | null;
  verifiedCity: string | null;
  verifiedState: string | null;
  verifiedZip: string | null;
  addressVerificationStatus: string;
  isDuplicate: boolean;
  duplicateGroupId: string | null;
}

/**
 * Prefers the USPS-verified address when available (more likely to catch
 * duplicates written with different-but-equivalent formatting); falls back
 * to the technician-submitted address otherwise.
 */
function addressKey(row: JobRow): string {
  const useVerified = row.addressVerificationStatus === 'verified' && row.verifiedAddressLine1 && row.verifiedZip;
  const line1 = useVerified ? row.verifiedAddressLine1! : row.addressLine1;
  const city = useVerified ? (row.verifiedCity ?? row.city) : row.city;
  const state = useVerified ? (row.verifiedState ?? row.state) : row.state;
  const zip = (useVerified ? row.verifiedZip! : row.zip).slice(0, 5);
  return `${normalizePart(line1)}|${normalizePart(city)}|${normalizePart(state)}|${zip}`;
}

/**
 * Nightly reconciliation pass: recomputes duplicate groups from scratch each
 * run by grouping every job in the (partitioned, but transparently queried
 * as one table) `jobs` table by normalized address. A full recompute — vs.
 * an incremental diff against "jobs since last run" — is deliberately
 * simpler and avoids missing a match between a new submission and an old
 * one; revisit if the jobs table's size makes a full scan too slow.
 *
 * Known limitation: a payroll admin's manual "unlink" (POST
 * /jobs/duplicates/:groupId/resolve) is not remembered across runs — if the
 * addresses still match, the next nightly run re-flags them. Persisting a
 * manual override was left out of this phase's scope; see design plan §10.
 */
export async function reconcileDuplicates(db: Db, _job: Job): Promise<void> {
  const rows: JobRow[] = await db
    .select({
      id: jobs.id,
      state: jobs.state,
      addressLine1: jobs.addressLine1,
      city: jobs.city,
      zip: jobs.zip,
      verifiedAddressLine1: jobs.verifiedAddressLine1,
      verifiedCity: jobs.verifiedCity,
      verifiedState: jobs.verifiedState,
      verifiedZip: jobs.verifiedZip,
      addressVerificationStatus: jobs.addressVerificationStatus,
      isDuplicate: jobs.isDuplicate,
      duplicateGroupId: jobs.duplicateGroupId,
    })
    .from(jobs);

  const groups = new Map<string, JobRow[]>();
  for (const row of rows) {
    const key = addressKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const matchedJobIds = new Set<string>();

  await db.transaction(async (tx) => {
    for (const members of groups.values()) {
      if (members.length < 2) continue;

      const existingGroupId = members.find((m) => m.duplicateGroupId)?.duplicateGroupId;
      const groupId = existingGroupId ?? randomUUID();

      for (const member of members) {
        matchedJobIds.add(member.id);
        const alreadyLinked = member.isDuplicate && member.duplicateGroupId === groupId;

        await tx
          .update(jobs)
          .set({ isDuplicate: true, duplicateGroupId: groupId, updatedAt: new Date() })
          .where(and(eq(jobs.id, member.id), eq(jobs.state, member.state)));

        await tx.insert(duplicateLinks).values({ duplicateGroupId: groupId, jobId: member.id, jobState: member.state }).onConflictDoNothing();

        if (!alreadyLinked) {
          await tx.insert(auditLog).values({
            jobId: member.id,
            jobState: member.state,
            actorId: SYSTEM_USER_ID,
            action: 'marked_duplicate',
            fieldName: 'is_duplicate',
            oldValue: member.isDuplicate,
            newValue: true,
          });
        }
      }
    }

    // Jobs that were flagged as duplicates previously but no longer match
    // anyone this run (e.g. an admin corrected the address) get cleared.
    const staleDuplicates = rows.filter((row) => row.isDuplicate && !matchedJobIds.has(row.id));
    for (const row of staleDuplicates) {
      await tx
        .update(jobs)
        .set({ isDuplicate: false, duplicateGroupId: null, updatedAt: new Date() })
        .where(and(eq(jobs.id, row.id), eq(jobs.state, row.state)));

      if (row.duplicateGroupId) {
        await tx
          .delete(duplicateLinks)
          .where(and(eq(duplicateLinks.duplicateGroupId, row.duplicateGroupId), eq(duplicateLinks.jobId, row.id)));
      }

      await tx.insert(auditLog).values({
        jobId: row.id,
        jobState: row.state,
        actorId: SYSTEM_USER_ID,
        action: 'field_updated',
        fieldName: 'is_duplicate',
        oldValue: true,
        newValue: false,
      });
    }
  });
}

import { and, desc, eq } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { jobs, users, workCodes, discrepancyReasons, distributionList, type Db } from '@liveoak/db';
import type { Env } from '../env.js';
import { sendEmail } from '../lib/postmark.js';
import { logger } from '../lib/logger.js';
import { captureException } from '../lib/sentry.js';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface DigestRow {
  jobNumber: string;
  state: string;
  addressLine1: string;
  city: string;
  zip: string;
  workCode: string | null;
  technicianEmail: string | null;
  discrepancyReason: string | null;
  discrepancyNotes: string | null;
  submittedAt: Date;
}

function renderHtml(rows: DigestRow[]): string {
  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.jobNumber)}</td>
        <td>${escapeHtml(r.state)}</td>
        <td>${escapeHtml(r.addressLine1)}, ${escapeHtml(r.city)} ${escapeHtml(r.zip)}</td>
        <td>${escapeHtml(r.workCode ?? '—')}</td>
        <td>${escapeHtml(r.technicianEmail ?? '—')}</td>
        <td>${escapeHtml(r.discrepancyReason ?? '—')}</td>
        <td>${escapeHtml(r.discrepancyNotes ?? '')}</td>
        <td>${r.submittedAt.toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}</td>
      </tr>`,
    )
    .join('');

  return `
    <h1>LiveOak — Discrepancy Digest</h1>
    <p>${rows.length} job${rows.length === 1 ? '' : 's'} currently flagged with a discrepancy.</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; font-size: 13px;">
      <thead>
        <tr>
          <th>Job #</th><th>State</th><th>Address</th><th>Work Code</th>
          <th>Technician</th><th>Reason</th><th>Notes</th><th>Submitted</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

/**
 * Nightly 8:00 PM America/Chicago digest (scheduled via BullMQ's native
 * `tz` option in apps/worker/src/index.ts): emails every currently
 * discrepancy-flagged job to each active distribution_list recipient.
 *
 * Dedup behavior: resends every night until the discrepancy is resolved
 * (cleared or the job edited) — the documented default assumption (design
 * plan §10 item 5) rather than a once-only send. `discrepancy_last_notified_at`
 * is stamped for visibility but doesn't gate whether a job is included.
 */
export async function sendDiscrepancyDigest(db: Db, env: Env, _job: Job): Promise<void> {
  if (!env.POSTMARK_SERVER_TOKEN || !env.DIGEST_EMAIL_FROM) {
    logger.warn('sendDiscrepancyDigest: POSTMARK_SERVER_TOKEN/DIGEST_EMAIL_FROM not configured, skipping run.');
    return;
  }

  const recipients = await db.select().from(distributionList).where(eq(distributionList.active, true));
  if (recipients.length === 0) {
    logger.info('sendDiscrepancyDigest: no active distribution_list recipients, skipping run.');
    return;
  }

  const flagged = await db
    .select({
      jobId: jobs.id,
      jobNumber: jobs.jobNumber,
      state: jobs.state,
      addressLine1: jobs.addressLine1,
      city: jobs.city,
      zip: jobs.zip,
      workCode: workCodes.code,
      technicianEmail: users.email,
      discrepancyReason: discrepancyReasons.label,
      discrepancyNotes: jobs.discrepancyNotes,
      submittedAt: jobs.submittedAt,
    })
    .from(jobs)
    .leftJoin(workCodes, eq(jobs.workCodeId, workCodes.id))
    .leftJoin(users, eq(jobs.technicianId, users.id))
    .leftJoin(discrepancyReasons, eq(jobs.discrepancyReasonId, discrepancyReasons.id))
    .where(eq(jobs.isDiscrepancy, true))
    .orderBy(desc(jobs.submittedAt));

  if (flagged.length === 0) {
    logger.info('sendDiscrepancyDigest: no discrepancies flagged, skipping run.');
    return;
  }

  const html = renderHtml(flagged);
  const subject = `LiveOak: ${flagged.length} discrepanc${flagged.length === 1 ? 'y' : 'ies'} flagged`;

  // One recipient at a time, and a send failure for one (bad address,
  // Postmark rejecting it, etc.) must not stop the rest from being sent —
  // an unhandled throw here would abort the loop, and since `recipients` is
  // read in the same order every run, that one bad address would silently
  // block every recipient after it in the list on every future run too.
  let failureCount = 0;
  for (const recipient of recipients) {
    try {
      await sendEmail({
        serverToken: env.POSTMARK_SERVER_TOKEN,
        from: env.DIGEST_EMAIL_FROM,
        to: recipient.email,
        subject,
        htmlBody: html,
      });
    } catch (err) {
      failureCount += 1;
      logger.error({ err, recipient: recipient.email }, 'sendDiscrepancyDigest: failed to send to recipient');
      captureException(err);
    }
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const row of flagged) {
      await tx
        .update(jobs)
        .set({ discrepancyLastNotifiedAt: now })
        .where(and(eq(jobs.id, row.jobId), eq(jobs.state, row.state)));
    }
  });

  // Surface partial failure to BullMQ (retry/alerting) without having
  // skipped any deliverable recipient or left discrepancyLastNotifiedAt
  // unset for the ones that did go out.
  if (failureCount > 0) {
    throw new Error(`sendDiscrepancyDigest: failed to send to ${failureCount}/${recipients.length} recipient(s)`);
  }
}

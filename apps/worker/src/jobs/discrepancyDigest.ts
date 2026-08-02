import type { Job } from 'bullmq';
import type { Db } from '@liveoak/db';

/**
 * Nightly 8:00 PM America/Chicago digest: queries `jobs WHERE is_discrepancy
 * = true`, renders an HTML summary, and emails every active
 * `distribution_list` recipient via Postmark. Scheduled with BullMQ's native
 * `tz: 'America/Chicago'` repeat option (see apps/worker/src/index.ts) so
 * CST/CDT transitions are handled correctly without manual offset math.
 *
 * Dedup behavior (resend nightly until resolved vs. once) is an open
 * question — see design plan §10, item 5 — before this is implemented.
 */
export async function sendDiscrepancyDigest(_db: Db, _job: Job): Promise<void> {
  throw new Error('sendDiscrepancyDigest: not yet implemented (Phase 5)');
}

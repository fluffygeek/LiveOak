import type { Job } from 'bullmq';
import type { Db } from '@liveoak/db';

/**
 * Nightly reconciliation pass: scans `jobs` (the parent table spans all
 * per-state partitions transparently) for records submitted since the last
 * run, normalizes addresses, and groups matches into duplicate_group_ids in
 * `duplicate_links` + `jobs.is_duplicate`. Every state change here should be
 * paired with an `audit_log` row (action='marked_duplicate').
 *
 * Interpretation of "split by state / merged nightly" and exact run time are
 * open questions — see design plan §10, items 1 and 10 — before this job's
 * query scope/schedule is finalized.
 */
export async function reconcileDuplicates(_db: Db, _job: Job): Promise<void> {
  throw new Error('reconcileDuplicates: not yet implemented (Phase 4)');
}

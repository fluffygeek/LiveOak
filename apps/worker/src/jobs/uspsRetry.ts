import type { Job } from 'bullmq';
import type { Db } from '@liveoak/db';

/**
 * Periodically re-attempts USPS verification for records stuck in
 * `address_verification_status = 'unavailable'` after an outage, so payroll
 * admins aren't stuck manually re-checking every one.
 */
export async function retryUspsVerification(_db: Db, _job: Job): Promise<void> {
  throw new Error('retryUspsVerification: not yet implemented (Phase 5)');
}

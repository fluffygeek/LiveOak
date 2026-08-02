import { Queue, Worker } from 'bullmq';
import { createDb } from '@liveoak/db';
import { createRedisConnection } from './redis.js';
import { reconcileDuplicates } from './jobs/reconcileDuplicates.js';
import { sendDiscrepancyDigest } from './jobs/discrepancyDigest.js';
import { retryUspsVerification } from './jobs/uspsRetry.js';

const QUEUE_NAME = 'liveoak-nightly';

async function main() {
  const connection = createRedisConnection();
  const db = createDb();
  const queue = new Queue(QUEUE_NAME, { connection });

  // Repeatable schedulers. `upsertJobScheduler` is idempotent across
  // redeploys/multiple instances so restarts don't create duplicate
  // schedules or double-fire jobs.
  await queue.upsertJobScheduler(
    'reconcile-duplicates',
    { pattern: '0 3 * * *', tz: 'America/New_York' }, // placeholder time, see design plan §10 item 10
    { name: 'reconcile-duplicates' },
  );
  await queue.upsertJobScheduler(
    'discrepancy-digest',
    { pattern: '0 20 * * *', tz: 'America/Chicago' }, // 8:00 PM Central, DST-aware
    { name: 'discrepancy-digest' },
  );
  await queue.upsertJobScheduler(
    'usps-retry',
    { pattern: '0 * * * *', tz: 'America/New_York' }, // hourly
    { name: 'usps-retry' },
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case 'reconcile-duplicates':
          return reconcileDuplicates(db, job);
        case 'discrepancy-digest':
          return sendDiscrepancyDigest(db, job);
        case 'usps-retry':
          return retryUspsVerification(db, job);
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.name} (${job?.id}) failed:`, err);
  });

  console.log('LiveOak worker started, listening on queue:', QUEUE_NAME);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

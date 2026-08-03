import { Queue, Worker } from 'bullmq';
import { createDb } from '@liveoak/db';
import { loadEnv } from './env.js';
import { logger } from './lib/logger.js';
import { initSentry, captureException, flushSentry } from './lib/sentry.js';
import { createQueueRedisConnection, createWorkerRedisConnection } from './redis.js';
import { reconcileDuplicates } from './jobs/reconcileDuplicates.js';
import { sendDiscrepancyDigest } from './jobs/discrepancyDigest.js';
import { retryUspsVerification } from './jobs/uspsRetry.js';

const QUEUE_NAME = 'liveoak-nightly';

// Bounds how many finished job records BullMQ keeps in Redis. The nightly
// jobs currently throw "not yet implemented" (Phases 4-5), so without this
// every scheduled run would accumulate in the failed set indefinitely.
const JOB_RETENTION = { removeOnComplete: 1000, removeOnFail: 5000 };

async function main() {
  const env = loadEnv();
  initSentry(env.SENTRY_DSN);
  const queueConnection = createQueueRedisConnection();
  const workerConnection = createWorkerRedisConnection();
  const db = createDb(env.DATABASE_URL);
  const queue = new Queue(QUEUE_NAME, { connection: queueConnection });
  queue.on('error', (err) => {
    logger.error({ err }, 'Queue error');
    captureException(err);
  });

  // Repeatable schedulers. `upsertJobScheduler` is idempotent across
  // redeploys/multiple instances so restarts don't create duplicate
  // schedules or double-fire jobs.
  await queue.upsertJobScheduler(
    'reconcile-duplicates',
    { pattern: '0 3 * * *', tz: 'America/New_York' }, // placeholder time, see design plan §10 item 10
    { name: 'reconcile-duplicates', opts: JOB_RETENTION },
  );
  await queue.upsertJobScheduler(
    'discrepancy-digest',
    { pattern: '0 20 * * *', tz: 'America/Chicago' }, // 8:00 PM Central, DST-aware
    { name: 'discrepancy-digest', opts: JOB_RETENTION },
  );
  await queue.upsertJobScheduler(
    'usps-retry',
    { pattern: '0 * * * *', tz: 'America/New_York' }, // hourly
    { name: 'usps-retry', opts: JOB_RETENTION },
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case 'reconcile-duplicates':
          return reconcileDuplicates(db, job);
        case 'discrepancy-digest':
          return sendDiscrepancyDigest(db, env, job);
        case 'usps-retry':
          return retryUspsVerification(db, env, job);
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    },
    { connection: workerConnection },
  );

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
    captureException(err);
  });
  worker.on('failed', (job, err) => {
    logger.error({ err, jobName: job?.name, jobId: job?.id }, 'Job failed');
    captureException(err);
  });

  logger.info({ queue: QUEUE_NAME }, 'LiveOak worker started');

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Received signal, shutting down gracefully');
    let exitCode = 0;
    try {
      await worker.close();
    } catch (err) {
      exitCode = 1;
      logger.error({ err }, 'Worker shutdown failed');
      captureException(err);
    }
    try {
      await queue.close();
    } catch (err) {
      exitCode = 1;
      logger.error({ err }, 'Queue shutdown failed');
      captureException(err);
    }
    workerConnection.disconnect();
    queueConnection.disconnect();
    process.exit(exitCode);
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(async (err) => {
  logger.error({ err }, 'Fatal error during worker startup');
  captureException(err);
  await flushSentry();
  process.exit(1);
});

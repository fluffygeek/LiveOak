import pino from 'pino';

/**
 * Structured JSON logs (matching apps/api's Fastify/pino output) so worker
 * output is consistent with the API's and machine-parseable by whatever log
 * aggregator the deployment target uses, instead of freeform console text.
 */
export const logger = pino({ name: 'liveoak-worker' });

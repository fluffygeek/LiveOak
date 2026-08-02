import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte } from 'drizzle-orm';
import { jobs } from '@liveoak/db';
import { authenticate, requireActiveUser, requireRole } from '../middleware/rbac.js';
import { currentWeekStartUtc } from '../lib/weekly-window.js';

/**
 * GET /jobs/mine — read-only weekly list for the signed-in technician.
 * Query-time rolling window (Sunday midnight America/New_York), not a
 * stored snapshot — see design plan §2.10.
 */
export async function jobRoutes(app: FastifyInstance) {
  app.get('/jobs/mine', { preHandler: [authenticate, requireActiveUser, requireRole(['technician'])] }, async (request) => {
    const weekStart = currentWeekStartUtc();
    return app.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.technicianId, request.currentUser!.id), gte(jobs.submittedAt, weekStart)))
      .orderBy(desc(jobs.submittedAt));
  });
}

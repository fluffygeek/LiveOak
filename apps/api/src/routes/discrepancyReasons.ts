import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { discrepancyReasons } from '@liveoak/db';
import { authenticate, requireActiveUser } from '../middleware/rbac.js';

/** Read-only for now — write endpoints (add/edit reasons) are app_admin config work, added in Phase 5. */
export async function discrepancyReasonRoutes(app: FastifyInstance) {
  app.get('/discrepancy-reasons', { preHandler: [authenticate, requireActiveUser] }, async () => {
    return app.db
      .select()
      .from(discrepancyReasons)
      .where(eq(discrepancyReasons.active, true))
      .orderBy(asc(discrepancyReasons.sortOrder), asc(discrepancyReasons.label));
  });
}

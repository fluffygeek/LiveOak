import type { FastifyInstance } from 'fastify';
import { authenticate, requireActiveUser } from '../middleware/rbac.js';

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [authenticate, requireActiveUser] }, async (request) => {
    return request.currentUser;
  });
}

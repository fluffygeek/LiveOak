import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@liveoak/shared-types';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: {
      id: string;
      email: string;
      role: UserRole;
      active: boolean;
    };
  }
}

interface AccessTokenPayload {
  id: string;
  email: string;
  role: UserRole;
  active: boolean;
}

/**
 * Verifies the LiveOak JWT and attaches the decoded user to the request.
 * Route handlers should never trust a role/identity claim that didn't pass through this.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = await request.jwtVerify<AccessTokenPayload>();
    request.currentUser = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      active: payload.active,
    };
  } catch {
    reply.code(401).send({ error: 'unauthorized' });
  }
}

export function requireActiveUser(request: FastifyRequest, reply: FastifyReply) {
  if (!request.currentUser?.active) {
    reply.code(403).send({ error: 'account_inactive' });
  }
}

/**
 * `app_admin` is a strict superset of `payroll_admin` — callers pass the
 * minimal role set for a route (e.g. requireRole(['payroll_admin'])) and this
 * always also allows app_admin, so role logic is never duplicated per-route.
 */
export function requireRole(allowed: readonly UserRole[]) {
  const allowedWithSuperset = new Set<UserRole>([...allowed, 'app_admin']);
  return function roleGuard(request: FastifyRequest, reply: FastifyReply) {
    const role = request.currentUser?.role;
    if (!role || !allowedWithSuperset.has(role)) {
      reply.code(403).send({ error: 'forbidden' });
    }
  };
}

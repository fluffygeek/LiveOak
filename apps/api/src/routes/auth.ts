import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users, type Db } from '@liveoak/db';
import type { UserRole } from '@liveoak/shared-types';
import { verifyGoogleIdToken } from '../lib/google-auth.js';
import { signRefreshToken, verifyRefreshToken } from '../lib/tokens.js';

const googleSignInBody = z.object({
  idToken: z.string().min(1),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

function issueTokenPair(
  app: FastifyInstance,
  user: { id: string; email: string; role: UserRole; active: boolean },
) {
  const accessToken = app.jwt.sign(
    { id: user.id, email: user.email, role: user.role, active: user.active },
    { expiresIn: '15m' },
  );
  const refreshToken = signRefreshToken(user.id, app.env.JWT_REFRESH_SECRET);
  return { accessToken, refreshToken };
}

async function findActiveUserById(db: Db, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user && user.active ? user : undefined;
}

/**
 * POST /auth/google and POST /auth/refresh
 * Single source of truth for auth rules, shared by both the mobile app and
 * the admin web app: verifies the Google ID token, enforces the Workspace
 * domain restriction, and requires the email already exist in `users`
 * (accounts are provisioned by an app_admin — no self-registration).
 */
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/google', async (request, reply) => {
    const body = googleSignInBody.parse(request.body);
    const clientIds = [
      app.env.GOOGLE_OAUTH_CLIENT_ID_WEB,
      app.env.GOOGLE_OAUTH_CLIENT_ID_IOS,
      app.env.GOOGLE_OAUTH_CLIENT_ID_ANDROID,
    ].filter((id): id is string => Boolean(id));

    if (clientIds.length === 0) {
      return reply.code(500).send({ error: 'google_oauth_not_configured' });
    }

    const identity = await verifyGoogleIdToken(body.idToken, clientIds);

    if (!identity.emailVerified) {
      return reply.code(401).send({ error: 'email_not_verified' });
    }
    if (app.env.GOOGLE_WORKSPACE_DOMAIN && identity.hostedDomain !== app.env.GOOGLE_WORKSPACE_DOMAIN) {
      return reply.code(403).send({ error: 'domain_not_allowed' });
    }

    const [user] = await app.db.select().from(users).where(eq(users.email, identity.email));
    if (!user || !user.active) {
      return reply.code(403).send({ error: 'account_not_provisioned' });
    }

    await app.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    return reply.send(issueTokenPair(app, user));
  });

  // Refresh tokens are rotated on every use (old one is single-use in intent,
  // though not yet tracked in a revocation store — see design plan §8 for the
  // longer-term token-handling posture).
  app.post('/auth/refresh', async (request, reply) => {
    const body = refreshBody.parse(request.body);

    let decoded: { id: string };
    try {
      decoded = verifyRefreshToken(body.refreshToken, app.env.JWT_REFRESH_SECRET);
    } catch {
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }

    const user = await findActiveUserById(app.db, decoded.id);
    if (!user) {
      return reply.code(403).send({ error: 'account_not_provisioned' });
    }

    return reply.send(issueTokenPair(app, user));
  });
}

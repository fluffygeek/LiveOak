import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users } from '@liveoak/db';
import { verifyGoogleIdToken } from '../lib/google-auth.js';

const googleSignInBody = z.object({
  idToken: z.string().min(1),
});

/**
 * POST /auth/google
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

    const accessToken = app.jwt.sign(
      { id: user.id, email: user.email, role: user.role, active: user.active },
      { expiresIn: '15m' },
    );
    const refreshToken = app.jwt.sign({ id: user.id, type: 'refresh' }, { expiresIn: '30d' });

    return reply.send({ accessToken, refreshToken });
  });
}

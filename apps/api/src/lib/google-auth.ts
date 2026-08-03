import { OAuth2Client } from 'google-auth-library';

export interface VerifiedGoogleIdentity {
  email: string;
  emailVerified: boolean;
  hostedDomain?: string;
}

/**
 * Verifies a Google ID token's signature/audience and returns the claims we
 * care about. Callers must additionally check `hostedDomain` against the
 * configured Workspace domain and look up `email` in `users` — this function
 * does not decide authorization, only that the token is a genuine Google token.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientIds: string[],
): Promise<VerifiedGoogleIdentity> {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience: clientIds });
  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error('Google ID token missing email claim');
  }
  return {
    email: payload.email,
    emailVerified: payload.email_verified === true,
    hostedDomain: payload.hd,
  };
}

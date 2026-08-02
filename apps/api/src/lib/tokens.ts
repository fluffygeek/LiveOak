import jwt from 'jsonwebtoken';

export interface RefreshTokenPayload {
  id: string;
  type: 'refresh';
}

/** Refresh tokens are signed with a separate secret from access tokens so a leaked
 * access-token secret alone can't be used to mint long-lived refresh tokens. */
export function signRefreshToken(userId: string, secret: string): string {
  const payload: RefreshTokenPayload = { id: userId, type: 'refresh' };
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

export function verifyRefreshToken(token: string, secret: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, secret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  return decoded;
}

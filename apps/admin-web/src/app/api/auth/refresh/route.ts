import { NextResponse, type NextRequest } from 'next/server';
import { apiUrl, REFRESH_COOKIE_NAME } from '../../../../lib/api-url';

/**
 * Silent re-auth on page load: exchanges the httpOnly refresh cookie for a
 * fresh access token, and rotates the refresh token (see apps/api's
 * /auth/refresh handler for the rotation rationale).
 */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  const backendRes = await fetch(`${apiUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!backendRes.ok) {
    const response = NextResponse.json({ error: 'session_expired' }, { status: 401 });
    response.cookies.delete(REFRESH_COOKIE_NAME);
    return response;
  }

  const { accessToken, refreshToken: newRefreshToken } = await backendRes.json();
  const response = NextResponse.json({ accessToken });
  response.cookies.set(REFRESH_COOKIE_NAME, newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

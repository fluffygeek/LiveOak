import { NextResponse, type NextRequest } from 'next/server';
import { fetchBackend, setRefreshCookie } from '../../../../lib/api-url';

/**
 * Exchanges a Google ID token (from the browser's Google Identity Services
 * sign-in) for a LiveOak session, by calling the same /auth/google endpoint
 * the mobile app uses — one source of truth for auth rules (Workspace
 * domain restriction, provisioning check), per the design plan.
 *
 * The refresh token is stored in an httpOnly cookie (never accessible to
 * client JS); only the short-lived access token is returned to the browser,
 * where it's kept in memory (see src/lib/auth-context.tsx).
 */
export async function POST(request: NextRequest) {
  const { idToken } = await request.json();
  if (!idToken) {
    return NextResponse.json({ error: 'missing_id_token' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetchBackend('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    return NextResponse.json({ error: 'backend_unreachable' }, { status: 502 });
  }

  if (!backendRes.ok) {
    const body = await backendRes.json().catch(() => ({}));
    return NextResponse.json(body, { status: backendRes.status });
  }

  const { accessToken, refreshToken } = await backendRes.json();
  const response = NextResponse.json({ accessToken });
  setRefreshCookie(response, refreshToken);
  return response;
}

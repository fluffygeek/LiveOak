'use client';

import { useAuth } from '../lib/auth-context';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

/**
 * Phase 1 scope: login only. Once signed in, this shows the authenticated
 * user's profile (from GET /me) as proof the auth flow works end to end;
 * the records dashboard and other admin screens are built in Phase 3+.
 */
export default function HomePage() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <p>Loading…</p>;
  }

  if (!user) {
    return (
      <main>
        <h1>LiveOak Admin</h1>
        <p>Sign in with your company Google account.</p>
        <GoogleSignInButton />
      </main>
    );
  }

  return (
    <main>
      <h1>LiveOak Admin</h1>
      <p>
        Signed in as {user.email} ({user.role})
      </p>
      <button onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}

'use client';

import { useAuth } from '../lib/auth-context';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  if (!user) {
    return (
      <main className="card" style={{ maxWidth: 360, margin: '10vh auto 0' }}>
        <h1>LiveOak Admin</h1>
        <p className="muted">Sign in with your company Google account.</p>
        <GoogleSignInButton />
      </main>
    );
  }

  return (
    <main>
      <h1>Welcome back</h1>
      <p className="muted">
        Signed in as {user.email} · <span className="role-badge">{user.role.replace('_', ' ')}</span>
      </p>
      <p>Use the navigation above to get to Records, Duplicates, or Admin.</p>
    </main>
  );
}

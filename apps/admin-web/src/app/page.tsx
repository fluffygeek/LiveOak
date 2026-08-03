'use client';

import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

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
      {(user.role === 'payroll_admin' || user.role === 'app_admin') && (
        <p>
          <Link href="/records">View Records →</Link>
        </p>
      )}
      {user.role === 'app_admin' && (
        <p>
          <Link href="/admin">Application Administration →</Link>
        </p>
      )}
      <button onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}

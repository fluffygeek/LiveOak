'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';

/** App admin config landing page — see design plan §5. */
export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'app_admin')) router.replace('/');
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'app_admin') return <p>Loading…</p>;

  return (
    <main>
      <h1>Application Administration</h1>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <ul>
        <li>
          <Link href="/admin/users">Users</Link>
        </li>
        <li>
          <Link href="/admin/work-codes">Work Codes</Link>
        </li>
        <li>
          <Link href="/admin/discrepancy-reasons">Discrepancy Reasons</Link>
        </li>
        <li>
          <Link href="/admin/distribution-list">Distribution List (digest recipients)</Link>
        </li>
        <li>
          <Link href="/admin/config">App Config</Link>
        </li>
      </ul>
    </main>
  );
}

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

  if (loading || !user || user.role !== 'app_admin') return <p className="muted">Loading…</p>;

  const links = [
    { href: '/admin/users', label: 'Users', description: 'Provision technicians and admins by Gmail address.' },
    { href: '/admin/work-codes', label: 'Work Codes', description: 'Codes and their required photo counts.' },
    { href: '/admin/discrepancy-reasons', label: 'Discrepancy Reasons', description: 'Reasons available when flagging a record.' },
    { href: '/admin/distribution-list', label: 'Distribution List', description: 'Recipients of the nightly discrepancy digest.' },
    { href: '/admin/config', label: 'App Config', description: 'Singleton settings such as the USPS kill switch.' },
  ];

  return (
    <main>
      <h1>Application Administration</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="card card-link" style={{ display: 'block', marginBottom: 0 }}>
            <strong>{link.label}</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}

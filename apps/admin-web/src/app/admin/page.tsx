'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { IconClipboardList, IconMail, IconSliders, IconTag, IconUsers } from '../../components/icons';

/** App admin config landing page — see design plan §5. */
export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'app_admin')) router.replace('/');
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'app_admin') return <p className="muted">Loading…</p>;

  const links = [
    { href: '/admin/users', label: 'Users', description: 'Provision technicians and admins by Gmail address.', icon: <IconUsers /> },
    { href: '/admin/work-codes', label: 'Work Codes', description: 'Codes and their required photo counts.', icon: <IconClipboardList /> },
    {
      href: '/admin/discrepancy-reasons',
      label: 'Discrepancy Reasons',
      description: 'Reasons available when flagging a record.',
      icon: <IconTag />,
    },
    {
      href: '/admin/distribution-list',
      label: 'Distribution List',
      description: 'Recipients of the nightly discrepancy digest.',
      icon: <IconMail />,
    },
    { href: '/admin/config', label: 'App Config', description: 'Singleton settings such as the USPS kill switch.', icon: <IconSliders /> },
  ];

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Application Administration</h1>
          <p className="page-subtitle">System-wide settings that shape how records, payroll, and technicians behave.</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="card card-link" style={{ display: 'block', marginBottom: 0 }}>
            <span
              className="stat-card-icon tone-primary"
              style={{ marginBottom: 12 }}
            >
              {link.icon}
            </span>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>{link.label}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}

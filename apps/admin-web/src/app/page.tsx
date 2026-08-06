'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { useApiClient } from '../lib/api-client';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { StatCard } from '../components/StatCard';
import { SkeletonStatGrid } from '../components/Skeleton';
import { IconAlertTriangle, IconClipboardList, IconCopy, IconSettings } from '../components/icons';

interface DashboardCounts {
  total: number;
  discrepancies: number;
  duplicates: number;
}

export default function HomePage() {
  const { user, loading } = useAuth();
  const { apiFetch } = useApiClient();
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);

  const canSeeRecords = user && (user.role === 'payroll_admin' || user.role === 'app_admin');

  useEffect(() => {
    if (!canSeeRecords) {
      setCountsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCountsLoading(true);
      try {
        const [totalRes, discRes, dupRes] = await Promise.all([
          apiFetch('/jobs?page=1&perPage=1'),
          apiFetch('/jobs?page=1&perPage=1&isDiscrepancy=true'),
          apiFetch('/jobs?page=1&perPage=1&isDuplicate=true'),
        ]);
        const [totalBody, discBody, dupBody] = await Promise.all([
          totalRes.ok ? totalRes.json() : { total: 0 },
          discRes.ok ? discRes.json() : { total: 0 },
          dupRes.ok ? dupRes.json() : { total: 0 },
        ]);
        if (!cancelled) {
          setCounts({
            total: totalBody.total ?? 0,
            discrepancies: discBody.total ?? 0,
            duplicates: dupBody.total ?? 0,
          });
        }
      } catch {
        if (!cancelled) setCounts(null);
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSeeRecords, apiFetch]);

  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  if (!user) {
    return (
      <main className="card" style={{ maxWidth: 380, margin: '10vh auto 0' }}>
        <span className="app-brand-mark" style={{ marginBottom: 16 }}>
          LO
        </span>
        <h1>LiveOak Admin</h1>
        <p className="muted">Sign in with your company Google account to manage job records and payroll data.</p>
        <GoogleSignInButton />
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Welcome back</h1>
          <p className="page-subtitle">
            Signed in as {user.email} <span className="role-badge">{user.role.replace('_', ' ')}</span>
          </p>
        </div>
      </div>

      {user.role === 'technician' && (
        <p className="card">
          Technicians don&rsquo;t have access to this web portal — use the LiveOak mobile app to submit jobs.
        </p>
      )}

      {canSeeRecords && (
        <>
          {countsLoading ? (
            <SkeletonStatGrid count={3} />
          ) : (
            <div className="stat-grid">
              <StatCard
                label="Total records"
                value={counts ? counts.total.toLocaleString() : '—'}
                sub="All submitted jobs"
                icon={<IconClipboardList />}
                tone="primary"
              />
              <StatCard
                label="Discrepancies"
                value={counts ? counts.discrepancies.toLocaleString() : '—'}
                sub="Flagged for payroll review"
                icon={<IconAlertTriangle />}
                tone="warning"
              />
              <StatCard
                label="Duplicates"
                value={counts ? counts.duplicates.toLocaleString() : '—'}
                sub="Awaiting reconciliation"
                icon={<IconCopy />}
                tone="info"
              />
            </div>
          )}

          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Link href="/records" className="card card-link" style={{ marginBottom: 0 }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconClipboardList /> Records
              </strong>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Browse, filter, and correct submitted job records.
              </p>
            </Link>
            <Link href="/duplicates" className="card card-link" style={{ marginBottom: 0 }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconCopy /> Duplicate Review Queue
              </strong>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Resolve jobs the nightly reconciliation flagged as duplicates.
              </p>
            </Link>
            {user.role === 'app_admin' && (
              <Link href="/admin" className="card card-link" style={{ marginBottom: 0 }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconSettings /> Administration
                </strong>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  Manage users, work codes, discrepancy reasons, and app config.
                </p>
              </Link>
            )}
          </div>
        </>
      )}
    </main>
  );
}

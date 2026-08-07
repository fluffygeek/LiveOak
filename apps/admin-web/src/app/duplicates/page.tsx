'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { useApiClient } from '../../lib/api-client';
import type { DuplicateGroup } from '../../lib/types';
import { JobStatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { IconAlertTriangle, IconChevronLeft, IconCopy, IconMapPin, IconX } from '../../components/icons';

/**
 * Duplicate review queue: groups produced by the worker's nightly
 * reconciliation job. See design plan §5 (admin web flow).
 */
export default function DuplicatesPage() {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingGroupId, setResolvingGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/jobs/duplicates');
      if (!res.ok) {
        setError('Could not load duplicate groups.');
        return;
      }
      const body = await res.json();
      setGroups(Array.isArray(body.groups) ? body.groups : []);
    } catch {
      setError('Could not load duplicate groups. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUnlink(groupId: string, jobId: string) {
    setResolvingGroupId(groupId);
    setError(null);
    try {
      const res = await apiFetch(`/jobs/duplicates/${groupId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: [jobId] }),
      });
      if (!res.ok) {
        setError('Could not unlink this record.');
        return;
      }
      await load();
    } catch {
      setError('Could not unlink this record. Check your connection.');
    } finally {
      setResolvingGroupId(null);
    }
  }

  if (authLoading || !user) return <p className="muted">Loading…</p>;

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/records">
          <IconChevronLeft /> Records
        </Link>
      </p>
      <div className="page-header">
        <div>
          <h1>Duplicate Review Queue</h1>
          <p className="page-subtitle">
            Groups the nightly reconciliation job flagged as likely duplicate submissions.
          </p>
        </div>
      </div>

      {error && (
        <p className="alert alert-error">
          <IconAlertTriangle />
          {error}
        </p>
      )}

      {loading && <SkeletonTable columns={5} rows={4} />}

      {!loading && !error && groups.length === 0 && (
        <EmptyState
          icon={<IconCopy />}
          title="No duplicate groups flagged"
          subtitle="When the nightly reconciliation job finds likely duplicate submissions, they'll show up here for review."
        />
      )}

      {!loading &&
        groups.map((group) => (
          <section key={group.duplicateGroupId} className="card">
            <div className="card-header">
              <h2>
                <IconCopy /> Duplicate group
                <span className="badge badge-info" style={{ marginLeft: 8 }}>
                  {group.jobs.length} {group.jobs.length === 1 ? 'record' : 'records'}
                </span>
              </h2>
              <span
                className="muted"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                title={group.duplicateGroupId}
              >
                #{group.duplicateGroupId.slice(0, 8)}…
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job #</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="col-primary">
                        <Link href={`/records/${job.id}`}>{job.jobNumber}</Link>
                      </td>
                      <td>
                        <IconMapPin className="faint" style={{ marginRight: 4, verticalAlign: '-2px' }} />
                        {job.addressLine1}
                        <span className="cell-sub">
                          {job.city}, {job.state} {job.zip}
                        </span>
                      </td>
                      <td>
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td>
                        {new Date(job.submittedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <button
                          className="btn-secondary btn-sm"
                          aria-label={`Mark job ${job.jobNumber} as not a duplicate`}
                          onClick={() => handleUnlink(group.duplicateGroupId, job.id)}
                          disabled={resolvingGroupId === group.duplicateGroupId}
                        >
                          <IconX /> Not a duplicate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </main>
  );
}

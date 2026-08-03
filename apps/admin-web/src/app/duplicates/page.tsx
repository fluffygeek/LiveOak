'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { useApiClient } from '../../lib/api-client';
import type { DuplicateGroup } from '../../lib/types';

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
      <h1>Duplicate Review Queue</h1>
      <p className="breadcrumb">
        <Link href="/records">← Records</Link>
      </p>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="alert alert-error">{error}</p>}

      {!loading && !error && groups.length === 0 && <p className="empty-state">No duplicate groups flagged.</p>}

      {groups.map((group) => (
        <section key={group.duplicateGroupId} className="card">
          <h2>
            Group <span className="muted">{group.duplicateGroupId.slice(0, 8)}</span>
          </h2>
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
                    <td>
                      <Link href={`/records/${job.id}`}>{job.jobNumber}</Link>
                    </td>
                    <td>
                      {job.addressLine1}, {job.city} {job.state} {job.zip}
                    </td>
                    <td>{job.status}</td>
                    <td>{new Date(job.submittedAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn-secondary"
                        onClick={() => handleUnlink(group.duplicateGroupId, job.id)}
                        disabled={resolvingGroupId === group.duplicateGroupId}
                      >
                        Not a duplicate
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

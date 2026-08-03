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
      setGroups(body.groups);
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

  if (authLoading || !user) return <p>Loading…</p>;

  return (
    <main>
      <h1>Duplicate Review Queue</h1>
      <p>
        <Link href="/records">← Records</Link>
      </p>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {!loading && !error && groups.length === 0 && <p>No duplicate groups flagged.</p>}

      {groups.map((group) => (
        <section key={group.duplicateGroupId} style={{ marginBottom: 24, border: '1px solid #ddd', padding: 12 }}>
          <h2>Group {group.duplicateGroupId.slice(0, 8)}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Job #</th>
                <th align="left">Address</th>
                <th align="left">Status</th>
                <th align="left">Submitted</th>
                <th align="left"></th>
              </tr>
            </thead>
            <tbody>
              {group.jobs.map((job) => (
                <tr key={job.id} style={{ borderTop: '1px solid #eee' }}>
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
        </section>
      ))}
    </main>
  );
}

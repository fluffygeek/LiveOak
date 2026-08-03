'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { DistributionListEntry } from '../../../lib/types';

/** Digest email recipients — see apps/worker's sendDiscrepancyDigest. */
export default function DistributionListPage() {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [items, setItems] = useState<DistributionListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'app_admin')) router.replace('/');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/distribution-list');
      if (!res.ok) {
        setError('Could not load the distribution list.');
        return;
      }
      setItems(await res.json());
    } catch {
      setError('Could not load the distribution list. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch('/distribution-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, label: label || undefined }),
      });
      if (!res.ok) {
        setError('Could not add recipient.');
        return;
      }
      setEmail('');
      setLabel('');
      await load();
    } catch {
      setError('Could not add recipient. Check your connection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      const res = await apiFetch(`/distribution-list/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not remove recipient.');
        return;
      }
      await load();
    } catch {
      setError('Could not remove recipient. Check your connection.');
    }
  }

  if (authLoading || !user || user.role !== 'app_admin') return <p>Loading…</p>;

  return (
    <main>
      <h1>Distribution List</h1>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <p>Recipients of the nightly 8:00 PM Central discrepancy digest email.</p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" disabled={creating}>
          Add
        </button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Email</th>
              <th align="left">Label</th>
              <th align="left">Active</th>
              <th align="left"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{item.email}</td>
                <td>{item.label ?? '—'}</td>
                <td>{item.active ? 'Yes' : 'No'}</td>
                <td>
                  <button onClick={() => handleRemove(item.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

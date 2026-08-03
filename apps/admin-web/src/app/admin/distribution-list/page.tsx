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
  const [removingId, setRemovingId] = useState<string | null>(null);

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
    const target = items.find((i) => i.id === id);
    if (!window.confirm(`Remove ${target?.email ?? 'this recipient'} from the digest distribution list?`)) return;
    setError(null);
    setRemovingId(id);
    try {
      const res = await apiFetch(`/distribution-list/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not remove recipient.');
        return;
      }
      await load();
    } catch {
      setError('Could not remove recipient. Check your connection.');
    } finally {
      setRemovingId(null);
    }
  }

  if (authLoading || !user || user.role !== 'app_admin') return <p className="muted">Loading…</p>;

  return (
    <main>
      <h1>Distribution List</h1>
      <p className="breadcrumb">
        <Link href="/admin">← Admin</Link>
      </p>
      <p className="muted">Recipients of the nightly 8:00 PM Central discrepancy digest email.</p>

      {error && <p className="alert alert-error">{error}</p>}

      <form onSubmit={handleCreate} className="card field-row">
        <input
          aria-label="Email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          aria-label="Label"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" disabled={creating}>
          Add
        </button>
      </form>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : error ? null : items.length === 0 ? (
        <p className="empty-state">No digest recipients yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Label</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.email}</td>
                  <td>{item.label ?? '—'}</td>
                  <td>
                    <span className={`badge ${item.active ? 'badge-success' : 'badge-neutral'}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-danger" onClick={() => handleRemove(item.id)} disabled={removingId === item.id}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

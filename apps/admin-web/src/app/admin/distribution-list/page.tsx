'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { DistributionListEntry } from '../../../lib/types';
import { EmptyState } from '../../../components/EmptyState';
import { SkeletonTable } from '../../../components/Skeleton';
import { IconAlertTriangle, IconChevronLeft, IconMail, IconPlus, IconX } from '../../../components/icons';

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
      <p className="breadcrumb">
        <Link href="/admin">
          <IconChevronLeft /> Admin
        </Link>
      </p>
      <div className="page-header">
        <div>
          <h1>Distribution List</h1>
          <p className="page-subtitle">Recipients of the nightly 8:00 PM Central discrepancy digest email.</p>
        </div>
      </div>

      {error && (
        <p className="alert alert-error">
          <IconAlertTriangle />
          {error}
        </p>
      )}

      <form onSubmit={handleCreate} className="card toolbar">
        <span className="toolbar-heading">
          <IconPlus /> Add a recipient
        </span>
        <div className="field">
          <label htmlFor="dl-email">Email</label>
          <input
            id="dl-email"
            aria-label="Email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="dl-label">Label</label>
          <input
            id="dl-label"
            aria-label="Label"
            placeholder="Optional"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <button type="submit" disabled={creating}>
          <IconPlus /> {creating ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <SkeletonTable columns={4} rows={4} />
      ) : error ? null : items.length === 0 ? (
        <EmptyState icon={<IconMail />} title="No digest recipients yet" subtitle="Add the first recipient of the nightly discrepancy digest." />
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
                  <td className="col-primary">{item.email}</td>
                  <td>{item.label ?? <span className="faint">—</span>}</td>
                  <td>
                    <span className={`badge ${item.active ? 'badge-success' : 'badge-neutral'}`}>
                      <span className="badge-dot" />
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-danger btn-sm" onClick={() => handleRemove(item.id)} disabled={removingId === item.id}>
                      <IconX /> Remove
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

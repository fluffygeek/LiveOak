'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { DiscrepancyReason } from '../../../lib/types';
import { EmptyState } from '../../../components/EmptyState';
import { SkeletonTable } from '../../../components/Skeleton';
import { IconAlertTriangle, IconChevronLeft, IconPlus, IconTag } from '../../../components/icons';

export default function DiscrepancyReasonsPage() {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [items, setItems] = useState<DiscrepancyReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'app_admin')) router.replace('/');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/discrepancy-reasons');
      if (!res.ok) {
        setError('Could not load discrepancy reasons.');
        return;
      }
      setItems(await res.json());
    } catch {
      setError('Could not load discrepancy reasons. Check your connection.');
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
      const res = await apiFetch('/discrepancy-reasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, sortOrder: Number(sortOrder) }),
      });
      if (!res.ok) {
        setError('Could not create discrepancy reason.');
        return;
      }
      setLabel('');
      setSortOrder('0');
      await load();
    } catch {
      setError('Could not create discrepancy reason. Check your connection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(item: DiscrepancyReason) {
    setError(null);
    setPendingId(item.id);
    try {
      const res = await apiFetch(`/discrepancy-reasons/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      });
      if (!res.ok) {
        setError('Could not update discrepancy reason.');
        return;
      }
      await load();
    } catch {
      setError('Could not update discrepancy reason. Check your connection.');
    } finally {
      setPendingId(null);
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
          <h1>Discrepancy Reasons</h1>
          <p className="page-subtitle">Reasons payroll admins can pick from when flagging a record.</p>
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
          <IconPlus /> Add a reason
        </span>
        <div className="field">
          <label htmlFor="dr-label">Label</label>
          <input id="dr-label" aria-label="Label" placeholder="e.g. Footage mismatch" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="dr-sort">Sort order</label>
          <input
            id="dr-sort"
            aria-label="Sort order"
            type="number"
            className="input-narrow"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <button type="submit" disabled={creating}>
          <IconPlus /> {creating ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <SkeletonTable columns={4} rows={5} />
      ) : items.length === 0 ? (
        <EmptyState icon={<IconTag />} title="No discrepancy reasons yet" subtitle="Add the reasons payroll admins will choose from when flagging a job." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Sort Order</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="col-primary">{item.label}</td>
                  <td>{item.sortOrder}</td>
                  <td>
                    <span className={`badge ${item.active ? 'badge-success' : 'badge-neutral'}`}>
                      <span className="badge-dot" />
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleToggleActive(item)}
                      disabled={pendingId === item.id}
                    >
                      {item.active ? 'Deactivate' : 'Activate'}
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

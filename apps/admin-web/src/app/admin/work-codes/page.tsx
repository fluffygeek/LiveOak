'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { WorkCode } from '../../../lib/types';
import { EmptyState } from '../../../components/EmptyState';
import { SkeletonTable } from '../../../components/Skeleton';
import { IconAlertTriangle, IconChevronLeft, IconClipboardList, IconPlus } from '../../../components/icons';

export default function WorkCodesPage() {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [items, setItems] = useState<WorkCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [requiredPhotoCount, setRequiredPhotoCount] = useState('3');
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'app_admin')) router.replace('/');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/work-codes');
      if (!res.ok) {
        setError('Could not load work codes.');
        return;
      }
      setItems(await res.json());
    } catch {
      setError('Could not load work codes. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const photoCount = Number(requiredPhotoCount);
    if (!Number.isInteger(photoCount) || photoCount < 3) {
      setError('Required photos must be a whole number of 3 or more.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch('/work-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          description: description || undefined,
          requiredPhotoCount: photoCount,
        }),
      });
      if (!res.ok) {
        setError('Could not create work code.');
        return;
      }
      setCode('');
      setDescription('');
      setRequiredPhotoCount('3');
      await load();
    } catch {
      setError('Could not create work code. Check your connection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(item: WorkCode) {
    setError(null);
    setPendingId(item.id);
    try {
      const res = await apiFetch(`/work-codes/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      });
      if (!res.ok) {
        setError('Could not update work code.');
        return;
      }
      await load();
    } catch {
      setError('Could not update work code. Check your connection.');
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
          <h1>Work Codes</h1>
          <p className="page-subtitle">Codes technicians select in the field, and how many photos each requires.</p>
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
          <IconPlus /> Add a work code
        </span>
        <div className="field">
          <label htmlFor="wc-code">Code</label>
          <input id="wc-code" aria-label="Code" placeholder="e.g. TRENCH" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="wc-description">Description</label>
          <input
            id="wc-description"
            aria-label="Description"
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="wc-photos">Required photos</label>
          <input
            id="wc-photos"
            aria-label="Required photos"
            type="number"
            min={3}
            required
            className="input-narrow"
            value={requiredPhotoCount}
            onChange={(e) => setRequiredPhotoCount(e.target.value)}
          />
        </div>
        <button type="submit" disabled={creating}>
          <IconPlus /> {creating ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <SkeletonTable columns={5} rows={5} />
      ) : items.length === 0 ? (
        <EmptyState icon={<IconClipboardList />} title="No work codes yet" subtitle="Add the first code technicians will select when submitting a job." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Required Photos</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="col-primary" style={{ fontFamily: 'var(--font-mono)' }}>
                    {item.code}
                  </td>
                  <td>{item.description ?? <span className="faint">—</span>}</td>
                  <td>{item.requiredPhotoCount}</td>
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

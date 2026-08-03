'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { WorkCode } from '../../../lib/types';

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

  if (authLoading || !user || user.role !== 'app_admin') return <p>Loading…</p>;

  return (
    <main>
      <h1>Work Codes</h1>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input aria-label="Code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input
          aria-label="Description"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          aria-label="Required photos"
          type="number"
          min={3}
          required
          placeholder="Required photos"
          value={requiredPhotoCount}
          onChange={(e) => setRequiredPhotoCount(e.target.value)}
          style={{ width: 100 }}
        />
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
              <th align="left">Code</th>
              <th align="left">Description</th>
              <th align="left">Required Photos</th>
              <th align="left">Active</th>
              <th align="left"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{item.code}</td>
                <td>{item.description ?? '—'}</td>
                <td>{item.requiredPhotoCount}</td>
                <td>{item.active ? 'Yes' : 'No'}</td>
                <td>
                  <button onClick={() => handleToggleActive(item)} disabled={pendingId === item.id}>
                    {item.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { DiscrepancyReason } from '../../../lib/types';

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
    }
  }

  if (authLoading || !user || user.role !== 'app_admin') return <p>Loading…</p>;

  return (
    <main>
      <h1>Discrepancy Reasons</h1>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} required />
        <input
          type="number"
          placeholder="Sort order"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
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
              <th align="left">Label</th>
              <th align="left">Sort Order</th>
              <th align="left">Active</th>
              <th align="left"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{item.label}</td>
                <td>{item.sortOrder}</td>
                <td>{item.active ? 'Yes' : 'No'}</td>
                <td>
                  <button onClick={() => handleToggleActive(item)}>{item.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

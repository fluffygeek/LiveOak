'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { UserRow } from '../../../lib/types';
import { EmptyState } from '../../../components/EmptyState';
import { SkeletonTable } from '../../../components/Skeleton';
import { IconAlertTriangle, IconChevronLeft, IconPlus, IconUsers } from '../../../components/icons';
import { humanize } from '../../../lib/format';

const ROLES: UserRow['role'][] = ['technician', 'payroll_admin', 'app_admin'];

/** App-admin-only user provisioning by Gmail + role — no self-registration. */
export default function UsersPage() {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRow['role']>('technician');
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'app_admin')) router.replace('/');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/users');
      if (!res.ok) {
        setError('Could not load users.');
        return;
      }
      setItems(await res.json());
    } catch {
      setError('Could not load users. Check your connection.');
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
      const res = await apiFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, displayName: displayName || undefined }),
      });
      if (!res.ok) {
        setError('Could not add user.');
        return;
      }
      setEmail('');
      setDisplayName('');
      setRole('technician');
      await load();
    } catch {
      setError('Could not add user. Check your connection.');
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(target: UserRow, patch: Partial<Pick<UserRow, 'role' | 'active'>>) {
    setError(null);
    setPendingId(target.id);
    try {
      const res = await apiFetch(`/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === 'cannot_remove_last_app_admin' ? 'Cannot remove the last app admin.' : 'Could not update user.');
        return;
      }
      await load();
    } catch {
      setError('Could not update user. Check your connection.');
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
          <h1>Users</h1>
          <p className="page-subtitle">Provision technicians and admins by Gmail address — no self-registration.</p>
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
          <IconPlus /> Add a user
        </span>
        <div className="field">
          <label htmlFor="u-email">Gmail address</label>
          <input
            id="u-email"
            aria-label="Gmail address"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="u-name">Display name</label>
          <input
            id="u-name"
            aria-label="Display name"
            placeholder="Optional"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as UserRow['role'])}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={creating}>
          <IconPlus /> {creating ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <SkeletonTable columns={5} rows={5} />
      ) : error ? null : items.length === 0 ? (
        <EmptyState icon={<IconUsers />} title="No users yet" subtitle="Add technicians and admins by their Gmail address." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="col-primary">{item.email}</td>
                  <td>{item.displayName ?? <span className="faint">—</span>}</td>
                  <td>
                    <select
                      aria-label={`Role for ${item.email}`}
                      value={item.role}
                      disabled={pendingId === item.id || item.id === user.id}
                      onChange={(e) => handleUpdate(item, { role: e.target.value as UserRow['role'] })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {humanize(r)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${item.active ? 'badge-success' : 'badge-neutral'}`}>
                      <span className="badge-dot" />
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleUpdate(item, { active: !item.active })}
                      disabled={pendingId === item.id || item.id === user.id}
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

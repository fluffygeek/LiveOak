'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { AppConfigEntry } from '../../../lib/types';
import { EmptyState } from '../../../components/EmptyState';
import { SkeletonTable } from '../../../components/Skeleton';
import { IconAlertTriangle, IconChevronLeft, IconSliders } from '../../../components/icons';

/** Singleton app settings (USPS kill switch, digest send-hour override, etc). */
export default function AppConfigPage() {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [items, setItems] = useState<AppConfigEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'app_admin')) router.replace('/');
  }, [authLoading, user, router]);

  // Every row's input is editable at once, so a reload after saving one key
  // must not clobber edits typed into other rows. `resetKeys` limits which
  // drafts get overwritten from the server response; omitted for the
  // initial load, where every row should start from the server value.
  const load = useCallback(
    async (resetKeys?: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/config');
        if (!res.ok) {
          setError('Could not load app config.');
          return;
        }
        const body: AppConfigEntry[] = await res.json();
        setItems(body);
        setDrafts((prev) =>
          Object.fromEntries(
            body.map((entry) => [
              entry.key,
              resetKeys && !resetKeys.includes(entry.key) ? (prev[entry.key] ?? JSON.stringify(entry.value)) : JSON.stringify(entry.value),
            ]),
          ),
        );
      } catch {
        setError('Could not load app config. Check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(key: string) {
    setSavingKey(key);
    setError(null);
    try {
      let value: unknown;
      try {
        value = JSON.parse(drafts[key] ?? 'null');
      } catch {
        setError(`"${key}": value must be valid JSON (e.g. "true", "20", "\\"text\\"").`);
        return;
      }
      const res = await apiFetch(`/config/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        setError(`Could not save "${key}".`);
        return;
      }
      await load([key]);
    } catch {
      setError(`Could not save "${key}". Check your connection.`);
    } finally {
      setSavingKey(null);
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
          <h1>App Config</h1>
          <p className="page-subtitle">
            Singleton settings such as the USPS kill switch. Values are raw JSON — booleans as{' '}
            <code>true</code>/<code>false</code>, numbers unquoted, strings quoted.
          </p>
        </div>
      </div>

      {error && (
        <p className="alert alert-error">
          <IconAlertTriangle />
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonTable columns={4} rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={<IconSliders />} title="No config entries yet" subtitle="Singleton app settings will appear here once seeded." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td className="col-primary" style={{ fontFamily: 'var(--font-mono)' }}>
                    {item.key}
                  </td>
                  <td>
                    <input
                      aria-label={`Value for ${item.key}`}
                      value={drafts[item.key] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
                      style={{ width: 200, fontFamily: 'var(--font-mono)' }}
                    />
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                    {new Date(item.updatedAt).toLocaleString()}
                  </td>
                  <td>
                    <button className="btn-sm" onClick={() => handleSave(item.key)} disabled={savingKey === item.key}>
                      {savingKey === item.key ? 'Saving…' : 'Save'}
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

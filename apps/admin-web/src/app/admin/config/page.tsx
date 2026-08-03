'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { AppConfigEntry } from '../../../lib/types';

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

  if (authLoading || !user || user.role !== 'app_admin') return <p>Loading…</p>;

  return (
    <main>
      <h1>App Config</h1>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <p>Values are raw JSON (e.g. booleans as <code>true</code>/<code>false</code>, numbers unquoted, strings quoted).</p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Key</th>
              <th align="left">Value</th>
              <th align="left">Updated</th>
              <th align="left"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} style={{ borderTop: '1px solid #eee' }}>
                <td>{item.key}</td>
                <td>
                  <input
                    aria-label={`Value for ${item.key}`}
                    value={drafts[item.key] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
                    style={{ width: 200 }}
                  />
                </td>
                <td>{new Date(item.updatedAt).toLocaleString()}</td>
                <td>
                  <button onClick={() => handleSave(item.key)} disabled={savingKey === item.key}>
                    Save
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

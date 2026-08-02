'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { useApiClient } from '../../lib/api-client';
import type { Job, JobStatus, WorkCode } from '../../lib/types';

interface Filters {
  state: string;
  status: JobStatus | '';
  workCodeId: string;
  isDiscrepancy: boolean;
  isDuplicate: boolean;
  submittedFrom: string;
  submittedTo: string;
}

const EMPTY_FILTERS: Filters = {
  state: '',
  status: '',
  workCodeId: '',
  isDiscrepancy: false,
  isDuplicate: false,
  submittedFrom: '',
  submittedTo: '',
};

/**
 * Payroll admin records dashboard: filterable/paginated list of submitted
 * jobs. See design plan §5 (admin web flow).
 */
export default function RecordsPage() {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workCodes, setWorkCodes] = useState<WorkCode[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  useEffect(() => {
    apiFetch('/work-codes')
      .then((res) => (res.ok ? res.json() : []))
      .then(setWorkCodes)
      .catch(() => {});
  }, [apiFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '25' });
      if (filters.state) params.set('state', filters.state.toUpperCase());
      if (filters.status) params.set('status', filters.status);
      if (filters.workCodeId) params.set('workCodeId', filters.workCodeId);
      if (filters.isDiscrepancy) params.set('isDiscrepancy', 'true');
      if (filters.isDuplicate) params.set('isDuplicate', 'true');
      if (filters.submittedFrom) params.set('submittedFrom', filters.submittedFrom);
      if (filters.submittedTo) params.set('submittedTo', filters.submittedTo);

      const res = await apiFetch(`/jobs?${params.toString()}`);
      if (!res.ok) {
        setError('Could not load records.');
        return;
      }
      const body = await res.json();
      setJobs(body.jobs);
    } catch {
      setError('Could not load records. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  if (authLoading || !user) return <p>Loading…</p>;

  return (
    <main>
      <h1>Records</h1>
      <p>
        <Link href="/">← Home</Link>
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
      >
        <input
          placeholder="State (e.g. TX)"
          maxLength={2}
          value={filters.state}
          onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as JobStatus | '' }))}
        >
          <option value="">Any status</option>
          <option value="submitted">Submitted</option>
          <option value="closed">Closed</option>
          <option value="pictures_downloaded">Pictures Downloaded</option>
        </select>
        <select
          value={filters.workCodeId}
          onChange={(e) => setFilters((f) => ({ ...f, workCodeId: e.target.value }))}
        >
          <option value="">Any work code</option>
          {workCodes.map((wc) => (
            <option key={wc.id} value={wc.id}>
              {wc.code}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={filters.isDiscrepancy}
            onChange={(e) => setFilters((f) => ({ ...f, isDiscrepancy: e.target.checked }))}
          />
          Discrepancy only
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.isDuplicate}
            onChange={(e) => setFilters((f) => ({ ...f, isDuplicate: e.target.checked }))}
          />
          Duplicates only
        </label>
        <input
          type="date"
          value={filters.submittedFrom}
          onChange={(e) => setFilters((f) => ({ ...f, submittedFrom: e.target.value }))}
        />
        <input
          type="date"
          value={filters.submittedTo}
          onChange={(e) => setFilters((f) => ({ ...f, submittedTo: e.target.value }))}
        />
        <button type="submit">Filter</button>
        <button
          type="button"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
        >
          Clear
        </button>
      </form>

      {loading && <p>Loading records…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Job #</th>
              <th align="left">State</th>
              <th align="left">Address</th>
              <th align="left">Status</th>
              <th align="left">Discrepancy</th>
              <th align="left">Duplicate</th>
              <th align="left">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} style={{ borderTop: '1px solid #eee' }}>
                <td>
                  <Link href={`/records/${job.id}`}>{job.jobNumber}</Link>
                </td>
                <td>{job.state}</td>
                <td>
                  {job.addressLine1}, {job.city} {job.zip}
                </td>
                <td>{job.status}</td>
                <td>{job.isDiscrepancy ? '⚠️' : ''}</td>
                <td>{job.isDuplicate ? '🔁' : ''}</td>
                <td>{new Date(job.submittedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Previous
        </button>
        <span>Page {page}</span>
        <button disabled={jobs.length < 25} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </main>
  );
}

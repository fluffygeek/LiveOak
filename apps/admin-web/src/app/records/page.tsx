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

const PER_PAGE = 25;

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
  const [total, setTotal] = useState(0);
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
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
      if (filters.state) params.set('state', filters.state.toUpperCase());
      if (filters.status) params.set('status', filters.status);
      if (filters.workCodeId) params.set('workCodeId', filters.workCodeId);
      if (filters.isDiscrepancy) params.set('isDiscrepancy', 'true');
      if (filters.isDuplicate) params.set('isDuplicate', 'true');
      if (filters.submittedFrom) params.set('submittedFrom', filters.submittedFrom);
      if (filters.submittedTo) {
        // The API compares against a timestamp; extend to the end of the selected day so it's inclusive.
        params.set('submittedTo', `${filters.submittedTo}T23:59:59.999Z`);
      }

      const res = await apiFetch(`/jobs?${params.toString()}`);
      if (!res.ok) {
        setError('Could not load records.');
        return;
      }
      const body = await res.json();
      setJobs(body.jobs);
      setTotal(body.total ?? 0);
    } catch {
      setError('Could not load records. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  if (authLoading || !user) return <p className="muted">Loading…</p>;

  return (
    <main>
      <h1>Records</h1>
      <p className="breadcrumb">
        <Link href="/duplicates">Duplicate Review Queue →</Link>
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
        className="card field-row"
      >
        <div className="field">
          <label htmlFor="filter-state">State</label>
          <input
            id="filter-state"
            placeholder="e.g. TX"
            maxLength={2}
            style={{ width: 70 }}
            value={filters.state}
            onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as JobStatus | '' }))}
          >
            <option value="">Any status</option>
            <option value="submitted">Submitted</option>
            <option value="closed">Closed</option>
            <option value="pictures_downloaded">Pictures Downloaded</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-work-code">Work code</label>
          <select
            id="filter-work-code"
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
        </div>
        <div className="field">
          <label htmlFor="filter-from">Submitted from</label>
          <input
            id="filter-from"
            type="date"
            value={filters.submittedFrom}
            onChange={(e) => setFilters((f) => ({ ...f, submittedFrom: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="filter-to">Submitted to</label>
          <input
            id="filter-to"
            type="date"
            value={filters.submittedTo}
            onChange={(e) => setFilters((f) => ({ ...f, submittedTo: e.target.value }))}
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filters.isDiscrepancy}
            onChange={(e) => setFilters((f) => ({ ...f, isDiscrepancy: e.target.checked }))}
          />
          Discrepancy only
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filters.isDuplicate}
            onChange={(e) => setFilters((f) => ({ ...f, isDuplicate: e.target.checked }))}
          />
          Duplicates only
        </label>
        <button type="submit">Filter</button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
        >
          Clear
        </button>
      </form>

      {loading && <p className="muted">Loading records…</p>}
      {error && <p className="alert alert-error">{error}</p>}

      {!loading && !error && jobs.length === 0 && (
        <p className="empty-state">No records match these filters.</p>
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job #</th>
                <th>State</th>
                <th>Address</th>
                <th>Status</th>
                <th>Flags</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link href={`/records/${job.id}`}>{job.jobNumber}</Link>
                  </td>
                  <td>{job.state}</td>
                  <td>
                    {job.addressLine1}, {job.city} {job.zip}
                  </td>
                  <td>{job.status}</td>
                  <td>
                    {job.isDiscrepancy && <span className="badge badge-warning">Discrepancy</span>}{' '}
                    {job.isDuplicate && <span className="badge badge-info">Duplicate</span>}
                  </td>
                  <td>{new Date(job.submittedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Previous
        </button>
        <span className="muted">Page {page}</span>
        <button
          className="btn-secondary"
          disabled={page * PER_PAGE >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </main>
  );
}

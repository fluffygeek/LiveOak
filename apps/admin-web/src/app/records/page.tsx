'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { useApiClient } from '../../lib/api-client';
import type { Job, JobStatus, WorkCode } from '../../lib/types';
import { FlagBadges, JobStatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardList,
  IconCopy,
  IconFilter,
  IconSearch,
  IconX,
} from '../../components/icons';

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

function hasActiveFilters(f: Filters): boolean {
  return Boolean(
    f.state || f.status || f.workCodeId || f.isDiscrepancy || f.isDuplicate || f.submittedFrom || f.submittedTo,
  );
}

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
  const [discrepancyTotal, setDiscrepancyTotal] = useState<number | null>(null);
  const [duplicateTotal, setDuplicateTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  useEffect(() => {
    apiFetch('/work-codes')
      .then((res) => (res.ok ? res.json() : []))
      .then(setWorkCodes)
      .catch(() => {});
  }, [apiFetch]);

  // Independent of the current filters, so the strip always reflects the
  // whole book of records — a payroll admin filtering by state shouldn't see
  // the discrepancy/duplicate counts silently change with them.
  useEffect(() => {
    apiFetch('/jobs?page=1&perPage=1&isDiscrepancy=true')
      .then((res) => (res.ok ? res.json() : { total: null }))
      .then((body) => setDiscrepancyTotal(body.total ?? null))
      .catch(() => setDiscrepancyTotal(null));
    apiFetch('/jobs?page=1&perPage=1&isDuplicate=true')
      .then((res) => (res.ok ? res.json() : { total: null }))
      .then((body) => setDuplicateTotal(body.total ?? null))
      .catch(() => setDuplicateTotal(null));
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

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(page * PER_PAGE, total);

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Records</h1>
          <p className="page-subtitle">Submitted job records across every technician and state.</p>
        </div>
        <div className="page-actions">
          <Link href="/duplicates" className="btn btn-secondary">
            Duplicate Review Queue
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Total records" value={total.toLocaleString()} icon={<IconClipboardList />} tone="primary" />
        <StatCard
          label="Discrepancies"
          value={discrepancyTotal === null ? '—' : discrepancyTotal.toLocaleString()}
          sub="Flagged for payroll review"
          icon={<IconAlertTriangle />}
          tone="warning"
          onClick={() => {
            setFilters({ ...EMPTY_FILTERS, isDiscrepancy: true });
            setPage(1);
          }}
        />
        <StatCard
          label="Duplicates"
          value={duplicateTotal === null ? '—' : duplicateTotal.toLocaleString()}
          sub="Awaiting reconciliation"
          icon={<IconCopy />}
          tone="info"
          onClick={() => {
            setFilters({ ...EMPTY_FILTERS, isDuplicate: true });
            setPage(1);
          }}
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
        className="card toolbar"
      >
        <span className="toolbar-heading">
          <IconFilter /> Filter records
        </span>
        <div className="field">
          <label htmlFor="filter-state">State</label>
          <input
            id="filter-state"
            placeholder="e.g. TX"
            maxLength={2}
            className="input-narrow"
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
        <button type="submit">
          <IconSearch /> Filter
        </button>
        {hasActiveFilters(filters) && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
          >
            <IconX /> Clear filters
          </button>
        )}
      </form>

      {error && (
        <p className="alert alert-error">
          <IconAlertTriangle />
          {error}
        </p>
      )}

      {loading && <SkeletonTable columns={6} rows={8} />}

      {!loading && !error && jobs.length === 0 && (
        <EmptyState
          icon={<IconClipboardList />}
          title="No records match these filters"
          subtitle={
            hasActiveFilters(filters)
              ? 'Try widening the date range or clearing a filter.'
              : 'Submitted jobs will show up here once technicians start logging work.'
          }
          action={
            hasActiveFilters(filters) ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="table-wrap">
          <div className="table-caption">
            {total.toLocaleString()} record{total === 1 ? '' : 's'}
          </div>
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
                  <td className="col-primary">
                    <Link href={`/records/${job.id}`}>{job.jobNumber}</Link>
                  </td>
                  <td>{job.state}</td>
                  <td>
                    {job.addressLine1}
                    <span className="cell-sub">
                      {job.city}, {job.state} {job.zip}
                    </span>
                  </td>
                  <td>
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="col-flags">
                    <FlagBadges isDiscrepancy={job.isDiscrepancy} isDuplicate={job.isDuplicate} />
                  </td>
                  <td>
                    {new Date(job.submittedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="pagination">
          <span className="muted">
            Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{total.toLocaleString()}</strong>
          </span>
          <div className="pagination-controls">
            <button
              className="btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <IconChevronLeft /> Previous
            </button>
            <span className="muted">Page {page}</span>
            <button
              className="btn-secondary btn-sm"
              disabled={page * PER_PAGE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <IconChevronRight />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

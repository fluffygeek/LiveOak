'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useApiClient } from '../../../lib/api-client';
import type { AuditLogEntry, DiscrepancyReason, JobDetail, WorkCode } from '../../../lib/types';

export default function RecordDetailPage({ params }: { params: { id: string } }) {
  const { user, loading: authLoading } = useAuth();
  const { apiFetch } = useApiClient();
  const router = useRouter();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [workCodes, setWorkCodes] = useState<WorkCode[]>([]);
  const [reasons, setReasons] = useState<DiscrepancyReason[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Editable form fields.
  const [jobNumber, setJobNumber] = useState('');
  const [workCodeId, setWorkCodeId] = useState('');
  const [footage, setFootage] = useState('');
  const [notes, setNotes] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  const loadAuditLog = useCallback(async () => {
    const res = await apiFetch(`/jobs/${params.id}/audit-log`);
    if (res.ok) setAuditLog(await res.json());
  }, [apiFetch, params.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobRes, workCodesRes, reasonsRes] = await Promise.all([
        apiFetch(`/jobs/${params.id}`),
        apiFetch('/work-codes'),
        apiFetch('/discrepancy-reasons'),
      ]);
      if (!jobRes.ok) {
        setError('Record not found.');
        return;
      }
      const j: JobDetail = await jobRes.json();
      setJob(j);
      setJobNumber(j.jobNumber);
      setWorkCodeId(j.workCodeId);
      setFootage(j.footage);
      setNotes(j.notes ?? '');
      setAddressLine1(j.addressLine1);
      setAddressLine2(j.addressLine2 ?? '');
      setCity(j.city);
      setState(j.state);
      setZip(j.zip);
      setSelectedReasonId(j.discrepancyReasonId ?? '');
      setDiscrepancyNotes(j.discrepancyNotes ?? '');

      if (workCodesRes.ok) setWorkCodes(await workCodesRes.json());
      if (reasonsRes.ok) setReasons(await reasonsRes.json());
      await loadAuditLog();
    } catch {
      setError('Could not load this record. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, params.id, loadAuditLog]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/jobs/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobNumber,
          workCodeId,
          footage: Number(footage),
          notes: notes || null,
          addressLine1,
          addressLine2: addressLine2 || null,
          city,
          zip,
        }),
      });
      if (!res.ok) {
        setError('Could not save changes.');
        return;
      }
      setJob(await res.json());
      setNotice('Saved.');
      await loadAuditLog();
    } catch {
      setError('Could not save changes. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetStatus(status: 'closed' | 'pictures_downloaded' | 'submitted') {
    setError(null);
    try {
      const res = await apiFetch(`/jobs/${params.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError('Could not update status.');
        return;
      }
      setJob(await res.json());
      await loadAuditLog();
    } catch {
      setError('Could not update status. Check your connection.');
    }
  }

  async function handleFlagDiscrepancy() {
    if (!selectedReasonId) {
      setError('Choose a discrepancy reason first.');
      return;
    }
    setError(null);
    try {
      const res = await apiFetch(`/jobs/${params.id}/discrepancy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discrepancyReasonId: selectedReasonId,
          discrepancyNotes: discrepancyNotes || undefined,
        }),
      });
      if (!res.ok) {
        setError('Could not flag discrepancy.');
        return;
      }
      setJob(await res.json());
      await loadAuditLog();
    } catch {
      setError('Could not flag discrepancy. Check your connection.');
    }
  }

  async function handleClearDiscrepancy() {
    setError(null);
    try {
      const res = await apiFetch(`/jobs/${params.id}/discrepancy`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not clear discrepancy.');
        return;
      }
      setJob(await res.json());
      await loadAuditLog();
    } catch {
      setError('Could not clear discrepancy. Check your connection.');
    }
  }

  if (authLoading || !user) return <p className="muted">Loading…</p>;
  if (loading) return <p className="muted">Loading record…</p>;
  if (error && !job) return <p className="alert alert-error">{error}</p>;
  if (!job) return null;

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/records">← Records</Link>
      </p>
      <h1>Job {job.jobNumber}</h1>
      <p className="muted">
        Status: <strong>{job.status}</strong> · Address verification: <strong>{job.addressVerificationStatus}</strong>
        {job.isDuplicate && (
          <>
            {' '}
            <span className="badge badge-info">Duplicate</span>
          </>
        )}
      </p>

      {notice && <p className="alert alert-success">{notice}</p>}
      {error && <p className="alert alert-error">{error}</p>}

      <section className="card">
        <h2>Record</h2>
        <div className="field-grid">
          <label htmlFor="job-number">Job number</label>
          <input id="job-number" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} />

          <label htmlFor="work-code">Work code</label>
          <select id="work-code" value={workCodeId} onChange={(e) => setWorkCodeId(e.target.value)}>
            {workCodes.map((wc) => (
              <option key={wc.id} value={wc.id}>
                {wc.code}
              </option>
            ))}
          </select>

          <label htmlFor="footage">Footage</label>
          <input id="footage" value={footage} onChange={(e) => setFootage(e.target.value)} />

          <label htmlFor="address-1">Address line 1</label>
          <input id="address-1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />

          <label htmlFor="address-2">Address line 2</label>
          <input id="address-2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />

          <label htmlFor="city">City</label>
          <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />

          <span className="field-label">State</span>
          <span className="muted" title="State is the record's partition key and cannot be changed here.">
            {state}
          </span>

          <label htmlFor="zip">ZIP</label>
          <input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} />

          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="form-actions" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </section>

      <section className="card section">
        <h2>Status</h2>
        <div className="field-row">
          <button onClick={() => handleSetStatus('closed')} disabled={job.status === 'closed'}>
            Mark Closed
          </button>
          <button
            onClick={() => handleSetStatus('pictures_downloaded')}
            disabled={job.status === 'pictures_downloaded'}
          >
            Mark Pictures Downloaded
          </button>
          <button
            className="btn-secondary"
            onClick={() => handleSetStatus('submitted')}
            disabled={job.status === 'submitted'}
          >
            Revert to Submitted
          </button>
        </div>
      </section>

      <section className="card section">
        <h2>Discrepancy</h2>
        {job.isDiscrepancy ? (
          <div>
            <p>
              <span className="badge badge-warning">Flagged</span>{' '}
              {reasons.find((r) => r.id === job.discrepancyReasonId)?.label ?? job.discrepancyReasonId}
            </p>
            {job.discrepancyNotes && <p className="muted">Notes: {job.discrepancyNotes}</p>}
            <button className="btn-danger" onClick={handleClearDiscrepancy}>
              Clear Discrepancy
            </button>
          </div>
        ) : (
          <div className="field-row">
            <select
              aria-label="Discrepancy reason"
              value={selectedReasonId}
              onChange={(e) => setSelectedReasonId(e.target.value)}
            >
              <option value="">Select a reason…</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Discrepancy notes"
              placeholder="Notes (optional)"
              value={discrepancyNotes}
              onChange={(e) => setDiscrepancyNotes(e.target.value)}
            />
            <button onClick={handleFlagDiscrepancy}>Flag Discrepancy</button>
          </div>
        )}
      </section>

      <section className="card section">
        <h2>Photos ({job.photos.length})</h2>
        {job.photos.length === 0 ? (
          <p className="empty-state">No photos uploaded.</p>
        ) : (
          <div className="photo-grid">
            {job.photos.map((photo) =>
              photo.downloadUrl ? (
                <a
                  key={photo.id}
                  href={photo.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open full-size photo for job ${job.jobNumber}`}
                >
                  <img src={photo.downloadUrl} alt={`Photo uploaded for job ${job.jobNumber}`} className="photo-thumb" />
                </a>
              ) : (
                <span key={photo.id} className="muted">
                  {photo.s3Key}
                </span>
              ),
            )}
          </div>
        )}
      </section>

      <section className="card section">
        <h2>Audit Log</h2>
        {auditLog.length === 0 ? (
          <p className="empty-state">No audit history yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Field</th>
                  <th>Old → New</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.occurredAt).toLocaleString()}</td>
                    <td>{entry.actorDisplayName ?? entry.actorEmail ?? entry.actorId}</td>
                    <td>{entry.action}</td>
                    <td>{entry.fieldName ?? '—'}</td>
                    <td>
                      {entry.fieldName
                        ? `${JSON.stringify(entry.oldValue) ?? 'null'} → ${JSON.stringify(entry.newValue) ?? 'null'}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

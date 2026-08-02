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

  if (authLoading || !user) return <p>Loading…</p>;
  if (loading) return <p>Loading record…</p>;
  if (error && !job) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!job) return null;

  return (
    <main>
      <p>
        <Link href="/records">← Records</Link>
      </p>
      <h1>Job {job.jobNumber}</h1>
      <p>
        Status: <strong>{job.status}</strong> · Address verification:{' '}
        <strong>{job.addressVerificationStatus}</strong>
        {job.isDuplicate && <span style={{ color: '#b45309' }}> · 🔁 Duplicate</span>}
      </p>

      {notice && <p style={{ color: 'green' }}>{notice}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section>
        <h2>Record</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 8, maxWidth: 480 }}>
          <label>Job number</label>
          <input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} />

          <label>Work code</label>
          <select value={workCodeId} onChange={(e) => setWorkCodeId(e.target.value)}>
            {workCodes.map((wc) => (
              <option key={wc.id} value={wc.id}>
                {wc.code}
              </option>
            ))}
          </select>

          <label>Footage</label>
          <input value={footage} onChange={(e) => setFootage(e.target.value)} />

          <label>Address line 1</label>
          <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />

          <label>Address line 2</label>
          <input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />

          <label>City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} />

          <label>State</label>
          <span title="State is the record's partition key and cannot be changed here.">{state}</span>

          <label>ZIP</label>
          <input value={zip} onChange={(e) => setZip(e.target.value)} />

          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button onClick={handleSave} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Status</h2>
        <button onClick={() => handleSetStatus('closed')} disabled={job.status === 'closed'}>
          Mark Closed
        </button>{' '}
        <button
          onClick={() => handleSetStatus('pictures_downloaded')}
          disabled={job.status === 'pictures_downloaded'}
        >
          Mark Pictures Downloaded
        </button>{' '}
        <button onClick={() => handleSetStatus('submitted')} disabled={job.status === 'submitted'}>
          Revert to Submitted
        </button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Discrepancy</h2>
        {job.isDiscrepancy ? (
          <div>
            <p>Flagged. Reason: {reasons.find((r) => r.id === job.discrepancyReasonId)?.label ?? job.discrepancyReasonId}</p>
            {job.discrepancyNotes && <p>Notes: {job.discrepancyNotes}</p>}
            <button onClick={handleClearDiscrepancy}>Clear Discrepancy</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={selectedReasonId} onChange={(e) => setSelectedReasonId(e.target.value)}>
              <option value="">Select a reason…</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Notes (optional)"
              value={discrepancyNotes}
              onChange={(e) => setDiscrepancyNotes(e.target.value)}
            />
            <button onClick={handleFlagDiscrepancy}>Flag Discrepancy</button>
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Photos ({job.photos.length})</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {job.photos.map((photo) =>
            photo.downloadUrl ? (
              <a
                key={photo.id}
                href={photo.downloadUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open full-size photo for job ${job.jobNumber}`}
              >
                <img
                  src={photo.downloadUrl}
                  alt={`Photo uploaded for job ${job.jobNumber}`}
                  style={{ width: 100, height: 100, objectFit: 'cover' }}
                />
              </a>
            ) : (
              <span key={photo.id}>{photo.s3Key}</span>
            ),
          )}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Audit Log</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">When</th>
              <th align="left">Who</th>
              <th align="left">Action</th>
              <th align="left">Field</th>
              <th align="left">Old → New</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((entry) => (
              <tr key={entry.id} style={{ borderTop: '1px solid #eee' }}>
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
      </section>
    </main>
  );
}

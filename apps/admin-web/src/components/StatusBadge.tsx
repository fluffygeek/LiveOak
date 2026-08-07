import type { AddressVerificationStatus, JobStatus } from '../lib/types';
import { IconAlertTriangle, IconCheckCircle, IconClock, IconCopy, IconWifiOff } from './icons';

const JOB_STATUS_META: Record<JobStatus, { label: string; className: string; icon: React.ReactNode }> = {
  submitted: { label: 'Submitted', className: 'badge-info', icon: <IconClock /> },
  pictures_downloaded: { label: 'Pictures Downloaded', className: 'badge-neutral', icon: <IconCheckCircle /> },
  closed: { label: 'Closed', className: 'badge-success', icon: <IconCheckCircle /> },
};

const UNKNOWN_META = { label: 'Unknown', className: 'badge-neutral', icon: null as React.ReactNode };

/** Renders a job's lifecycle status as a colored pill with an icon. */
export function JobStatusBadge({ status }: { status: JobStatus }) {
  // Falls back rather than throwing — `status` is a runtime value from the
  // API, not statically guaranteed to be a member of the JobStatus union.
  const meta = JOB_STATUS_META[status] ?? UNKNOWN_META;
  return (
    <span className={`badge ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

/** Discrepancy / duplicate flags shown together as a compact badge cluster. */
export function FlagBadges({ isDiscrepancy, isDuplicate }: { isDiscrepancy: boolean; isDuplicate: boolean }) {
  if (!isDiscrepancy && !isDuplicate) {
    return null;
  }
  return (
    <>
      {isDiscrepancy && (
        <span className="badge badge-warning">
          <IconAlertTriangle />
          Discrepancy
        </span>
      )}
      {isDuplicate && (
        <span className="badge badge-info">
          <IconCopy />
          Duplicate
        </span>
      )}
    </>
  );
}

const VERIFICATION_META: Record<AddressVerificationStatus, { label: string; className: string; icon: React.ReactNode }> = {
  verified: { label: 'Verified', className: 'badge-success', icon: <IconCheckCircle /> },
  pending: { label: 'Pending', className: 'badge-neutral', icon: <IconClock /> },
  failed: { label: 'Failed', className: 'badge-danger', icon: <IconAlertTriangle /> },
  skipped_new_build: { label: 'Skipped (new build)', className: 'badge-neutral', icon: <IconWifiOff /> },
  unavailable: { label: 'Unavailable', className: 'badge-neutral', icon: <IconWifiOff /> },
};

export function AddressVerificationBadge({ status }: { status: AddressVerificationStatus }) {
  const meta = VERIFICATION_META[status] ?? UNKNOWN_META;
  return (
    <span className={`badge ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

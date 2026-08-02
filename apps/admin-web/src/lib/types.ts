export type AddressVerificationStatus = 'pending' | 'verified' | 'failed' | 'skipped_new_build' | 'unavailable';
export type JobStatus = 'submitted' | 'closed' | 'pictures_downloaded';

export interface Job {
  id: string;
  state: string;
  jobNumber: string;
  technicianId: string;
  workCodeId: string;
  footage: string;
  notes: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  zip: string;
  isNewBuild: boolean;
  verifiedAddressLine1: string | null;
  verifiedCity: string | null;
  verifiedState: string | null;
  verifiedZip: string | null;
  verifiedZip4: string | null;
  addressVerificationStatus: AddressVerificationStatus;
  status: JobStatus;
  isDiscrepancy: boolean;
  discrepancyReasonId: string | null;
  discrepancyNotes: string | null;
  isDuplicate: boolean;
  duplicateGroupId: string | null;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  jobState: string;
  s3Key: string;
  contentType: string | null;
  uploadedAt: string;
  downloadUrl: string | null;
}

export interface JobDetail extends Job {
  photos: JobPhoto[];
}

export interface AuditLogEntry {
  id: number;
  jobId: string;
  actorId: string;
  actorEmail: string | null;
  actorDisplayName: string | null;
  action: string;
  fieldName: string | null;
  oldValue: unknown;
  newValue: unknown;
  occurredAt: string;
}

export interface WorkCode {
  id: string;
  code: string;
  description: string | null;
  requiredPhotoCount: number;
  active: boolean;
}

export interface DiscrepancyReason {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

export interface UserRow {
  id: string;
  email: string;
  role: 'technician' | 'payroll_admin' | 'app_admin';
  displayName: string | null;
  active: boolean;
}

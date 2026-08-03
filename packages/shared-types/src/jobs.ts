export const ADDRESS_VERIFICATION_STATUSES = [
  'pending',
  'verified',
  'failed',
  'skipped_new_build',
  'unavailable',
] as const;
export type AddressVerificationStatus = (typeof ADDRESS_VERIFICATION_STATUSES)[number];

export const JOB_STATUSES = ['submitted', 'closed', 'pictures_downloaded'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const AUDIT_ACTIONS = [
  'submitted',
  'field_updated',
  'status_changed',
  'marked_discrepancy',
  'cleared_discrepancy',
  'marked_duplicate',
  'photos_downloaded',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

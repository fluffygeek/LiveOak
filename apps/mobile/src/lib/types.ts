export interface JobDraft {
  id: string;
  technicianId: string;
  jobNumber: string | null;
  workCodeId: string | null;
  footage: string | null;
  notes: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isNewBuild: boolean;
  addressVerificationStatus: 'pending' | 'verified' | 'failed' | 'skipped_new_build' | 'unavailable';
  verifiedAddressLine1: string | null;
  verifiedCity: string | null;
  verifiedState: string | null;
  verifiedZip: string | null;
  verifiedZip4: string | null;
}

export interface JobDraftPhoto {
  id: string;
  draftId: string;
  s3Key: string;
  contentType: string | null;
  uploadedAt: string;
}

export interface WorkCode {
  id: string;
  code: string;
  description: string | null;
  requiredPhotoCount: number;
  active: boolean;
}

export interface SubmittedJob {
  id: string;
  state: string;
  jobNumber: string;
  addressLine1: string;
  city: string;
  zip: string;
  status: 'submitted' | 'closed' | 'pictures_downloaded';
  isDiscrepancy: boolean;
  submittedAt: string;
}

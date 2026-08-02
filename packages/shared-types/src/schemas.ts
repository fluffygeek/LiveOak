import { z } from 'zod';
import { USER_ROLES } from './roles.js';
import { ADDRESS_VERIFICATION_STATUSES, JOB_STATUSES } from './jobs.js';

export const userRoleSchema = z.enum(USER_ROLES);

export const addressSchema = z.object({
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5),
});

export const jobDraftInputSchema = z.object({
  jobNumber: z.string().min(1),
  workCodeId: z.string().uuid(),
  footage: z.number().positive(),
  notes: z.string().optional(),
  isNewBuild: z.boolean().default(false),
  address: addressSchema,
});
export type JobDraftInput = z.infer<typeof jobDraftInputSchema>;

export const addressVerificationStatusSchema = z.enum(ADDRESS_VERIFICATION_STATUSES);
export const jobStatusSchema = z.enum(JOB_STATUSES);

export const discrepancyFlagInputSchema = z.object({
  discrepancyReasonId: z.string().uuid(),
  discrepancyNotes: z.string().optional(),
});

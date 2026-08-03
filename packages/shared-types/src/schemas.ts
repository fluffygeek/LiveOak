import { z } from 'zod';
import { USER_ROLES } from './roles.js';
import { ADDRESS_VERIFICATION_STATUSES, JOB_STATUSES } from './jobs.js';

export const userRoleSchema = z.enum(USER_ROLES);

export const addressSchema = z.object({
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Must be a 2-letter state code'),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'Must be a 5-digit ZIP or ZIP+4'),
});

export const jobDraftInputSchema = z.object({
  jobNumber: z.string().min(1),
  workCodeId: z.string().uuid(),
  footage: z.number().positive(),
  notes: z.string().optional(),
  isNewBuild: z.boolean().default(false),
  address: addressSchema,
});
/** What a caller may submit — isNewBuild is optional here since the schema defaults it. */
export type JobDraftInput = z.input<typeof jobDraftInputSchema>;
/** The parsed/validated shape — isNewBuild is always present after `.parse()`. */
export type JobDraftOutput = z.output<typeof jobDraftInputSchema>;

export const addressVerificationStatusSchema = z.enum(ADDRESS_VERIFICATION_STATUSES);
export const jobStatusSchema = z.enum(JOB_STATUSES);

export const discrepancyFlagInputSchema = z.object({
  discrepancyReasonId: z.string().uuid(),
  discrepancyNotes: z.string().optional(),
});

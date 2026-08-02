import {
  pgTable,
  pgEnum,
  uuid,
  text,
  char,
  boolean,
  numeric,
  timestamp,
  jsonb,
  bigserial,
  integer,
  primaryKey,
  unique,
  customType,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// citext isn't a drizzle-orm builtin type; declare it via customType so email
// comparisons stay case-insensitive at the DB level (requires `CREATE EXTENSION citext`,
// see migrations/0001_init.sql).
const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const userRoleEnum = pgEnum('user_role', ['technician', 'payroll_admin', 'app_admin']);
export const addressVerificationStatusEnum = pgEnum('address_verification_status', [
  'pending',
  'verified',
  'failed',
  'skipped_new_build',
  'unavailable',
]);
export const jobStatusEnum = pgEnum('job_status', ['submitted', 'closed', 'pictures_downloaded']);
export const auditActionEnum = pgEnum('audit_action', [
  'submitted',
  'field_updated',
  'status_changed',
  'marked_discrepancy',
  'cleared_discrepancy',
  'marked_duplicate',
  'photos_downloaded',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique(),
  role: userRoleEnum('role').notNull(),
  displayName: text('display_name'),
  active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const workCodes = pgTable('work_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  description: text('description'),
  requiredPhotoCount: integer('required_photo_count').notNull().default(3),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const discrepancyReasons = pgTable('discrepancy_reasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * In-progress technician submissions. Kept separate from the partitioned
 * `jobs` table so `jobs` only ever contains finalized, immutable records.
 * The unique index on technicianId enforces "one draft at a time" at the DB level.
 */
export const jobDrafts = pgTable('job_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  technicianId: uuid('technician_id')
    .notNull()
    .unique()
    .references(() => users.id),
  jobNumber: text('job_number'),
  workCodeId: uuid('work_code_id').references(() => workCodes.id),
  footage: numeric('footage'),
  notes: text('notes'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  zip: text('zip'),
  isNewBuild: boolean('is_new_build').notNull().default(false),
  verifiedAddressLine1: text('verified_address_line1'),
  verifiedCity: text('verified_city'),
  verifiedState: text('verified_state'),
  verifiedZip: text('verified_zip'),
  verifiedZip4: text('verified_zip4'),
  addressVerificationStatus: addressVerificationStatusEnum('address_verification_status')
    .notNull()
    .default('pending'),
  addressVerificationCheckedAt: timestamp('address_verification_checked_at', {
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Photos attached to an in-progress draft, before the job is submitted.
 * Moved into `job_photos` (and this table's rows discarded) atomically at
 * submit time — see routes/jobDrafts.ts.
 */
export const jobDraftPhotos = pgTable('job_draft_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  draftId: uuid('draft_id')
    .notNull()
    .references(() => jobDrafts.id, { onDelete: 'cascade' }),
  s3Key: text('s3_key').notNull().unique(),
  contentType: text('content_type'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Core job record table. Physically partitioned by `state` (LIST partitioning).
 * The partition DDL itself is hand-authored in migrations/0001_init.sql — Drizzle's
 * migration generator does not emit `PARTITION BY` clauses, so this table definition
 * exists for typed query-building only; the source of truth for the physical layout
 * is the SQL migration.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').notNull().defaultRandom(),
    state: char('state', { length: 2 }).notNull(),
    jobNumber: text('job_number').notNull(),
    technicianId: uuid('technician_id')
      .notNull()
      .references(() => users.id),
    workCodeId: uuid('work_code_id')
      .notNull()
      .references(() => workCodes.id),
    footage: numeric('footage').notNull(),
    notes: text('notes'),

    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: text('city').notNull(),
    zip: text('zip').notNull(),
    isNewBuild: boolean('is_new_build').notNull().default(false),

    verifiedAddressLine1: text('verified_address_line1'),
    verifiedCity: text('verified_city'),
    verifiedState: text('verified_state'),
    verifiedZip: text('verified_zip'),
    verifiedZip4: text('verified_zip4'),
    addressVerificationStatus: addressVerificationStatusEnum('address_verification_status')
      .notNull()
      .default('pending'),
    addressVerificationCheckedAt: timestamp('address_verification_checked_at', {
      withTimezone: true,
    }),

    status: jobStatusEnum('status').notNull().default('submitted'),

    isDiscrepancy: boolean('is_discrepancy').notNull().default(false),
    discrepancyReasonId: uuid('discrepancy_reason_id').references(() => discrepancyReasons.id),
    discrepancyNotes: text('discrepancy_notes'),
    discrepancyLastNotifiedAt: timestamp('discrepancy_last_notified_at', { withTimezone: true }),

    isDuplicate: boolean('is_duplicate').notNull().default(false),
    duplicateGroupId: uuid('duplicate_group_id'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Partition key must be part of the primary key for native Postgres list partitioning.
    pk: primaryKey({ columns: [table.id, table.state] }),
  }),
);

export const jobPhotos = pgTable('job_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull(),
  jobState: char('job_state', { length: 2 }).notNull(),
  s3Key: text('s3_key').notNull().unique(),
  contentType: text('content_type'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const duplicateLinks = pgTable(
  'duplicate_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    duplicateGroupId: uuid('duplicate_group_id').notNull(),
    jobId: uuid('job_id').notNull(),
    jobState: char('job_state', { length: 2 }).notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    detectionMethod: text('detection_method').notNull().default('normalized_address_match'),
  },
  (table) => ({
    uniqueGroupJob: unique().on(table.duplicateGroupId, table.jobId),
  }),
);

/**
 * Intended to be append-only: migrations/0001_init.sql has a commented-out
 * `REVOKE UPDATE, DELETE` statement to enforce that at the DB-role level,
 * pending the runtime app role being provisioned. Until that's uncommented
 * and applied, immutability here is a convention, not an enforced guarantee.
 */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  jobId: uuid('job_id').notNull(),
  jobState: char('job_state', { length: 2 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  action: auditActionEnum('action').notNull(),
  fieldName: text('field_name'),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const distributionList = pgTable('distribution_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique(),
  label: text('label'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

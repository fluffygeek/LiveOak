import { auditLog, type Db } from '@liveoak/db';
import type { AuditAction } from '@liveoak/shared-types';

/** The transaction handle passed into `db.transaction(async (tx) => ...)`. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface RecordFieldDiffsArgs {
  jobId: string;
  jobState: string;
  actorId: string;
  oldRow: Record<string, unknown>;
  newRow: Record<string, unknown>;
  /** Only these keys are compared/recorded — callers pass the exact set of user-editable fields. */
  fields: readonly string[];
}

/**
 * Writes one audit_log row per changed field, computed server-side by
 * diffing old vs. new — never trusts the client to report what changed
 * (design plan §2.7). No-ops (no rows written) if nothing in `fields` differs.
 */
export async function recordFieldDiffs(tx: Tx, args: RecordFieldDiffsArgs): Promise<void> {
  const rows = args.fields
    .filter((field) => JSON.stringify(args.oldRow[field] ?? null) !== JSON.stringify(args.newRow[field] ?? null))
    .map((field) => ({
      jobId: args.jobId,
      jobState: args.jobState,
      actorId: args.actorId,
      action: 'field_updated' as const,
      fieldName: field,
      oldValue: args.oldRow[field] ?? null,
      newValue: args.newRow[field] ?? null,
    }));

  if (rows.length > 0) {
    await tx.insert(auditLog).values(rows);
  }
}

interface RecordActionArgs {
  jobId: string;
  jobState: string;
  actorId: string;
  action: AuditAction;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/** For non-field-diff audit events (status changes, discrepancy flags, etc). */
export async function recordAction(tx: Tx, args: RecordActionArgs): Promise<void> {
  await tx.insert(auditLog).values({
    jobId: args.jobId,
    jobState: args.jobState,
    actorId: args.actorId,
    action: args.action,
    fieldName: args.fieldName,
    oldValue: args.oldValue ?? null,
    newValue: args.newValue ?? null,
  });
}

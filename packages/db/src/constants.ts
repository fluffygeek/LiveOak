/**
 * Fixed id of the seeded system user (migrations/0003_phase4_system_user.sql),
 * used as `audit_log.actor_id` by automated background jobs (e.g. nightly
 * duplicate reconciliation) that have no human actor to attribute changes to.
 */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

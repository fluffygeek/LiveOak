# Operations & Hardening Handoff (Phase 6)

Companion to the README's deployment section and `docs/phase-0-checklist.md`.
This covers what was tested/audited for production-readiness, and the
runbook for common operational tasks.

## RBAC matrix

Every mutating and most read routes run `authenticate` → `requireActiveUser`
→ `requireRole([...])` (see `apps/api/src/middleware/rbac.ts`). `app_admin`
is a strict superset of `payroll_admin`, enforced once in `requireRole`
rather than duplicated per route.

| Route group | technician | payroll_admin | app_admin |
|---|---|---|---|
| `POST/PATCH/DELETE /jobs/draft*`, `GET /jobs/mine` | ✅ | ❌ | ❌ (by design — see note) |
| `GET /jobs`, `GET/PATCH /jobs/:id`, status/discrepancy routes | ❌ | ✅ | ✅ |
| `GET/POST /jobs/duplicates*` | ❌ | ✅ | ✅ |
| `GET /work-codes`, `GET /discrepancy-reasons` | ✅ (active-only) | ✅ | ✅ (sees inactive too) |
| `POST/PATCH /work-codes`, `/discrepancy-reasons` | ❌ | ❌ | ✅ |
| `GET/POST/DELETE /distribution-list`, `GET/PATCH /config` | ❌ | ❌ | ✅ |
| `GET/POST/PATCH /users` | ❌ | ❌ | ✅ |
| `GET /me` | ✅ | ✅ | ✅ |

**Note:** `jobDraftRoutes`/`jobRoutes` are technician-only, not
`app_admin`-accessible — an app_admin editing a submitted record goes
through the payroll routes (`payrollJobRoutes`), which is the correct path
since drafts/`GET /jobs/mine` are technician self-service concepts, not an
admin capability. This is an intentional exception to the superset rule, not
a gap.

**Known limitation:** `requireActiveUser` checks the `active` flag baked
into the JWT access token at issuance, not a live DB lookup. If an app_admin
deactivates a user mid-session, that user's *existing* access token remains
valid until it expires (short-lived by design — see `apps/api/src/lib/tokens.ts`)
rather than being revoked immediately. The next refresh-token exchange picks
up the deactivation (refresh reads current DB state). Acceptable given the
short access-token TTL; would need a token-revocation list to close entirely.

## S3 access audit

- Bucket must be created with **Block Public Access on** and no public bucket
  policy — the app never assumes public objects. (Not automatable from this
  repo; confirm in your S3/R2 console when provisioning.)
- All photo access is via presigned URLs only (`apps/api/src/lib/s3.ts`):
  5-minute TTL on both upload (`PUT`) and download (`GET`) URLs.
- Upload content-type is allowlisted (`isAllowedPhotoContentType`) to image
  types only.
- `POST /jobs/draft/:id/photos/confirm` verifies the object actually exists
  (`HeadObjectCommand`) before trusting a client-reported S3 key, scoped to
  `job-photos/{draftId}/` so one technician can't reference another's draft.

## DST transition testing

`currentWeekStartUtc()` (the technician weekly-list window, America/New_York)
and the worker's BullMQ cron schedules (`tz: 'America/Chicago'` for the
digest, `tz: 'America/New_York'` for reconciliation/USPS-retry) both rely on
IANA timezone-aware libraries (luxon, BullMQ's native `tz` option) rather
than fixed UTC offsets, specifically so DST transitions don't need special
handling in application code.

Automated coverage: `apps/api/src/lib/weekly-window.test.ts` pins expected
UTC offsets on both sides of the 2026 spring-forward (Mar 8) and fall-back
(Nov 1) transitions, including the transition day itself — the case a
fixed-offset shortcut would get wrong. Run with `pnpm --filter @liveoak/api test`.

BullMQ's `tz` option is a third-party library behavior (delegates to the
system/IANA tz database), not something this repo re-implements — no
additional test coverage was added for it beyond confirming the schedules
are configured with the correct zone.

## USPS outage simulation

`packages/usps/src/index.test.ts` mocks `fetch` to simulate: no credentials
configured, a network/timeout failure, a USPS 5xx, a USPS 400 (ambiguous —
logged, degrades to `unavailable`, never surfaced to the technician as a
rejection), a definite 404 (`failed`), a 401 mid-request (retried once with
a fresh token), and a successful verification. Run with
`pnpm --filter @liveoak/usps test`.

The retry job (`apps/worker/src/jobs/uspsRetry.ts`) re-attempts jobs stuck
`unavailable` hourly, batched to 50/run, ordered oldest-checked-first so a
prolonged outage's backlog can't starve any one job indefinitely.

## Error monitoring

`apps/api` and `apps/worker` both take an optional `SENTRY_DSN` env var
(`apps/*/src/lib/sentry.ts`). Unset (the default), it's a complete no-op —
nothing is sent anywhere, no startup dependency on Sentry being reachable.
When set: API 5xx errors and worker job/queue failures are reported via
`Sentry.captureException`.

## Structured logging

`apps/api` logs via Fastify's built-in pino logger. `apps/worker` now uses
a dedicated pino instance (`apps/worker/src/lib/logger.ts`) instead of raw
`console.*` calls, so both services emit consistent JSON logs regardless of
deployment target's log aggregator.

## Deploy pipeline

- CI (`.github/workflows/ci.yml`): lint → typecheck → build → test, plus a
  `docker-build` job that builds both `apps/api/Dockerfile` and
  `apps/worker/Dockerfile` (without pushing) on every PR — catches a
  Dockerfile drifting out of sync with the pnpm workspace layout before it
  reaches Railway.
- Railway (apps/api, apps/worker) and Vercel (apps/admin-web) deployment
  steps are documented in the README's Deployment section.

## Runbook

**Bootstrap the first app_admin** (new environment): after running
`pnpm db:migrate`, run `pnpm db:seed-admin` with the appropriate env vars —
see `packages/db/src/seed-admin.ts`.

**Rotate JWT secrets**: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` rotate
independently, and each only invalidates its own token type. Rotating
`JWT_ACCESS_SECRET` invalidates access tokens only — existing refresh tokens
remain valid and will mint new (validly-signed) access tokens on next use.
Rotating `JWT_REFRESH_SECRET` invalidates refresh tokens only — existing
access tokens remain valid until they expire on their own short TTL. To
revoke both token types at once, rotate both secrets in the same deployment.

**Investigate a stuck discrepancy digest**: check
`apps/worker`'s logs for `sendDiscrepancyDigest` — it logs and returns early
(doesn't throw) if `POSTMARK_SERVER_TOKEN`/`DIGEST_EMAIL_FROM` are unset, if
there are no active `distribution_list` recipients, or if there are no
`is_discrepancy = true` jobs. A thrown error (Postmark API failure) surfaces
as a BullMQ job failure and, if `SENTRY_DSN` is set, in Sentry.

**Investigate jobs stuck in `address_verification_status = 'unavailable'`**:
confirm `USPS_CLIENT_ID`/`USPS_CLIENT_SECRET` are set on `apps/worker` — the
retry job silently skips its run otherwise (logged as a warning, not an
error). Once configured, the hourly retry job picks up existing stuck
records automatically; no backfill script is needed.

**Recompute duplicate groups on demand**: there's no manual-trigger API
route for `reconcileDuplicates` (it's schedule-only, `0 3 * * *`
America/New_York, job name `reconcile-duplicates` on the `liveoak-nightly`
queue, no payload). To run it early, enqueue a one-off job directly against
Redis with `REDIS_URL` set in the environment:

```bash
node -e "
const { Queue } = require('bullmq');
const q = new Queue('liveoak-nightly', { connection: { url: process.env.REDIS_URL } });
q.add('reconcile-duplicates', {}).then(() => q.close());
"
```

The job runs in a single DB transaction: existing `duplicate_group_id`s are
preserved where a group's membership is unchanged, `duplicate_links` rows for
any group that gets merged away are deleted (not left orphaned), and affected
jobs' `updated_at` is bumped. Avoid running this manually at the same time the
3am scheduled run is in flight — both would recompute against the same rows
and race on which group ID wins.

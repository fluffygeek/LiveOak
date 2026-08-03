# LiveOak

Payroll job-tracking platform: a technician mobile app (React Native/Expo)
feeding a payroll/application admin web portal (Next.js), backed by a
Node.js/TypeScript API and PostgreSQL.

## Repo layout

- `apps/api` — Fastify REST API (auth, RBAC, job records)
- `apps/worker` — BullMQ background jobs (nightly reconciliation, discrepancy digest email, USPS retry)
- `apps/admin-web` — Next.js admin portal (payroll admins, application admins)
- `apps/mobile` — Expo app for technicians (iOS/Android)
- `packages/db` — Drizzle schema + hand-authored partitioned-table migration
- `packages/shared-types` — roles, enums, and zod schemas shared across apps
- `packages/usps` — shared USPS APIs v3 address-verification client (used by both apps/api and apps/worker)
- [`docs/phase-0-checklist.md`](docs/phase-0-checklist.md) — external setup steps (Google OAuth, USPS API, infra) needed before Phase 1
- [`docs/operations.md`](docs/operations.md) — RBAC/S3 audit, DST and USPS-outage test coverage, error monitoring, and the operations runbook

The full architecture, data model, and phased build plan (with Mermaid
diagrams for architecture, data model, mobile/web flows, nightly jobs, and a
non-technical overview) was reviewed and approved separately from this repo;
ask in the project channel if you need it re-shared.

## Getting started

```bash
pnpm install
cp .env.example .env   # then see docs/phase-0-checklist.md
pnpm db:migrate
pnpm dev:api
```

## Deployment

### apps/api and apps/worker — Railway

Each is deployed as its own Railway service pointing at this repo:

1. Create two services from this repo (one for `apps/api`, one for
   `apps/worker`). For each, in the service's Settings:
   - **Root Directory**: `/` (repo root — required so the Docker build
     context includes `packages/db` and `packages/shared-types`, which the
     app imports as pnpm workspace packages).
   - **Dockerfile Path**: `apps/api/Dockerfile` or `apps/worker/Dockerfile`.
2. Add a Railway PostgreSQL plugin (exposes `DATABASE_URL`) and a Railway
   Redis plugin (exposes `REDIS_URL`) to the project; both services can
   reference the same instances.
3. Set the remaining variables from `.env.example` on the `apps/api` service
   (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_WORKSPACE_DOMAIN`,
   `GOOGLE_OAUTH_CLIENT_ID_*`, `S3_*`, `USPS_*`, and `CORS_ORIGINS` — set this
   to the admin-web Vercel URL and, once registered, the mobile app's
   origin). The API listens on Railway's dynamically-assigned `PORT`
   automatically (falls back to `API_PORT`/4000 if unset).
4. `apps/worker` needs `DATABASE_URL` and `REDIS_URL` (required — see
   `apps/worker/src/env.ts`), plus `USPS_CLIENT_ID`/`USPS_CLIENT_SECRET` for
   the address-verification retry job and `POSTMARK_SERVER_TOKEN`/
   `DIGEST_EMAIL_FROM` for the discrepancy digest email — both pairs are
   optional and the corresponding job just logs a warning and skips its run
   if unset. It has no HTTP listener, so no public networking or health
   check is needed.
5. Run `pnpm db:migrate` (and `pnpm db:seed-admin` once) against the Railway
   Postgres instance before the first deploy serves traffic.

### apps/admin-web — Vercel

1. Import this repo as a Vercel project and set **Root Directory** to
   `apps/admin-web`. Vercel's pnpm-workspace detection installs from the
   repo root automatically (using the `packageManager` field in the root
   `package.json`), so `@liveoak/shared-types` resolves correctly — no extra
   build command overrides are needed.
2. Set project environment variables: `NEXT_PUBLIC_API_URL` and `API_URL`
   (both pointing at the Railway API's public URL), `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB`.
3. Set `CORS_ORIGINS` on the Railway `apps/api` service to the exact deployed
   origin, including its scheme (e.g. `https://liveoak-admin.vercel.app`, or
   your custom domain) — `@fastify/cors` matches configured string origins
   exactly, so a wildcard like `https://*.vercel.app` will not work. The
   admin UI's browser-side `fetch`s to `/jobs`, `/work-codes`, etc. go
   directly to the API and are blocked by CORS otherwise. The `/api/auth/*`
   routes are same-origin Next.js route handlers and aren't affected by this.

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
- `docs/phase-0-checklist.md` — external setup steps (Google OAuth, USPS API, infra) needed before Phase 1

See the full architecture, data model, and phased build plan in the design
plan (Mermaid diagrams for architecture, data model, mobile/web flows,
nightly jobs, and a non-technical overview).

## Getting started

```bash
pnpm install
cp .env.example .env   # then see docs/phase-0-checklist.md
pnpm db:migrate
pnpm dev:api
```

# Phase 0 Checklist

Code scaffolding for Phase 0 is done (see repo root). The items below require
actions outside this repo — accounts, approvals, and credentials — that only
someone with organizational authority can complete. Nothing in Phases 1+ can
be fully wired up (auth, address verification) until these are done.

## 1. Google Cloud / Workspace OAuth setup
- [ ] Create (or choose) a Google Cloud project for LiveOak.
- [ ] Configure the OAuth consent screen, restricted to your Workspace
      (Internal user type if available; otherwise External + enforce the
      `hd` domain claim server-side, already wired in `apps/api/src/routes/auth.ts`).
- [ ] Create an OAuth 2.0 **Web** client ID (used by `admin-web` and as the
      backend verification audience).
- [ ] Create an OAuth 2.0 **iOS** client ID and **Android** client ID
      (required separately for Expo/React Native per Google's guidance).
- [ ] Fill in `GOOGLE_OAUTH_CLIENT_ID_WEB`, `GOOGLE_OAUTH_CLIENT_ID_IOS`,
      `GOOGLE_OAUTH_CLIENT_ID_ANDROID`, and `GOOGLE_WORKSPACE_DOMAIN` in your
      `.env` (see `.env.example`).

## 2. USPS APIs v3 registration
- [ ] Register a USPS Business Customer Gateway account (if you don't already
      have one): https://gateway.usps.com
- [ ] Apply for USPS APIs v3 access, specifically the **Addresses API**
      (standardization / ZIP+4 lookup). Approval turnaround is external and
      can take several business days — this is on the critical path for
      Phase 2 (mobile address verification), so it should be started now,
      in parallel with the rest of Phase 0/1.
- [ ] Fill in `USPS_CLIENT_ID` / `USPS_CLIENT_SECRET` in `.env` once issued.

## 3. Infrastructure provisioning (pick a target; plan is cloud-agnostic)
- [ ] Provision a managed PostgreSQL 15+ instance for dev/staging (Render,
      RDS, Cloud SQL, Azure Database for PostgreSQL, etc.).
- [ ] Provision a managed Redis instance (for BullMQ).
- [ ] Provision an S3-compatible bucket for job photos (AWS S3 or Cloudflare
      R2), with **Block Public Access** enabled.
- [ ] Decide on the email provider (Postmark recommended, SES as a
      cost-optimized alternative — see design plan §7) and obtain an API
      token.

## 4. Bootstrap the first application administrator
- [ ] Once a dev database exists, run `pnpm db:migrate` to apply
      `packages/db/migrations/0001_init.sql`.
- [ ] Create the first `app_admin` (there's a chicken-and-egg problem:
      someone has to exist before "admins add users via POST /users" works):
      ```bash
      pnpm db:seed-admin -- --email=you@yourcompany.com --name="Your Name"
      ```
      Safe to re-run — it upserts by email and promotes an existing row to
      `app_admin` if one exists.

## 5. Local development
```bash
pnpm install
cp .env.example .env   # fill in values from steps 1-3 above
pnpm db:migrate         # apply packages/db/migrations against DATABASE_URL
pnpm dev:api             # http://localhost:4000/health
pnpm dev:worker
pnpm dev:admin-web
pnpm dev:mobile
```

Everything above corresponds to the "Open Questions / Assumptions" (§10) and
"Third-Party Integrations" (§7) sections of the design plan — resolve those
alongside this checklist before starting Phase 1.

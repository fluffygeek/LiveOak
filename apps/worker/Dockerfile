# Build context is the monorepo root (Railway: Root Directory = "." / repo
# root, Dockerfile Path = "apps/worker/Dockerfile") so pnpm workspace linking
# between apps/worker and packages/db, packages/shared-types resolves
# correctly.
FROM node:20-slim

RUN corepack enable

WORKDIR /repo

COPY --chown=node:node . .

# node:20-slim's built-in unprivileged `node` user, so the worker doesn't run
# as root inside the container.
USER node

# Filtered to @liveoak/worker and its workspace dependencies (db,
# shared-types, usps) — skips installing apps/admin-web, apps/api, apps/mobile's deps.
RUN pnpm install --filter '@liveoak/worker...' --prod --frozen-lockfile

# The worker is run via tsx (see apps/worker/package.json "start"), which
# transpiles TypeScript — including the workspace packages it imports — at
# runtime, so no separate `tsc` build/dist step is needed for deployment.
# No HTTP port is exposed: this is a background BullMQ worker, not a web service.
ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@liveoak/worker", "start"]

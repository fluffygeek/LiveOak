# Build context is the monorepo root (Railway: Root Directory = "." / repo
# root, Dockerfile Path = "apps/api/Dockerfile") so pnpm workspace linking
# between apps/api and packages/db, packages/shared-types resolves correctly.
FROM node:20-slim

RUN corepack enable

WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile

# The API is run via tsx (see apps/api/package.json "start"), which
# transpiles TypeScript — including the workspace packages it imports — at
# runtime, so no separate `tsc` build/dist step is needed for deployment.
ENV NODE_ENV=production
EXPOSE 4000

CMD ["pnpm", "--filter", "@liveoak/api", "start"]

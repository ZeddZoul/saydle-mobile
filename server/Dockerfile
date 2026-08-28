# The API, as a container.
#
# Multi-stage so the shipped image carries production dependencies only — the
# test suite pulls in an in-memory MongoDB binary that has no business in a
# running service.
#
# Node 24 to match `engines`, on Debian slim rather than Alpine: the Mongo
# driver and sharp-adjacent native builds are glibc-linked, and musl surprises
# are not worth the 40MB.
FROM node:24-slim AS deps

WORKDIR /app

# pnpm, pinned to the version the lockfile was written by.
RUN corepack enable && corepack prepare pnpm@10 --activate

# The workspace root is what defines the dependency graph, so both manifests
# have to be present before install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/

# `--prod` skips devDependencies; `--frozen-lockfile` fails loudly rather than
# quietly resolving something different from what was tested.
RUN pnpm install --filter @saydle/server --prod --frozen-lockfile


FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server

# Cloud Run injects PORT and expects the process to honour it. The default here
# only matters when running the image by hand.
ENV PORT=8080
EXPOSE 8080

# Never root. A compromised process should not own the filesystem it runs on.
USER node

CMD ["node", "server/src/index.js"]

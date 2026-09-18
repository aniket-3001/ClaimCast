# The API, as a container Cloud Run can start quickly.
#
# Cold start is the constraint that shapes this file. There is no always-on
# instance on the free tier, so the first request after an idle period pays for
# whatever the process does before it listens, and that request may well be a
# judge's. Two decisions follow from it.
#
# The TypeScript is bundled at build time rather than run through tsx. The
# workspace packages export raw .ts -- `packages/engine` is imported directly by
# both the API and the browser, which is the whole point of the layout -- so
# something has to compile them, and doing it here costs nothing at run time.
# Only our own source is bundled; the npm dependencies stay external and are
# installed normally, because bundling Prisma and pdf.js is a fight with no prize.
#
# The runtime image carries production dependencies only. No compiler, no CLI,
# no source. That is a smaller image to pull on a cold start and a smaller thing
# to attack, and it means the container cannot run a migration even by accident.
#
# Migrations are deliberately not run on boot. `prisma migrate deploy` from a
# starting container races every other instance that starts at the same moment,
# and it hands the production database to whatever the newest image thinks the
# schema should be. Run it from a laptop, deliberately, before deploying.
#
# Built from the repository root:
#   docker build -f infra/api.Dockerfile -t claimcast-api .

FROM node:22-slim AS build
WORKDIR /app

# The manifests alone first, so a source edit does not reinstall the world.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/engine/package.json ./packages/engine/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci

COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# The Prisma client is generated against the schema, not shipped with it, and the
# engine binary it downloads is platform-specific -- which is why this happens in
# a Linux image and not on the machine that runs the build.
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Our TypeScript, and nothing else. The externals are the packages that are
# installed in the runtime tree anyway; bundling them would only duplicate them.
RUN npx esbuild apps/api/src/server.ts \
      --bundle --platform=node --target=node22 --format=esm \
      --outfile=dist/server.mjs \
      --external:@prisma/client \
      --external:fastify \
      --external:'@fastify/*' \
      --external:pdfjs-dist \
      --external:'@anthropic-ai/sdk' \
      --external:dotenv \
      --external:zod

# The web app, into the same image. It is served by the API process on one
# origin -- see the static block in apps/api/src/server.ts for why -- so there
# is no second service to deploy, and no VITE_API_URL to set because "" already
# means same origin in apps/web/src/api.ts.
#
# Built here rather than copied in: .dockerignore excludes every dist/ from the
# build context deliberately, so what ships is always compiled from the source
# in this image and never from whatever happened to be on someone's laptop.
RUN npm run build --workspace @claimcast/web

# ── The runtime tree ─────────────────────────────────────────────────────
#
# Built beside the build tree rather than by pruning it, because prune leaves
# behind whatever it cannot prove is unused and the point is to know what ships.
# It is a separate directory rather than a reinstall over the same one: the
# generated Prisma client lives in node_modules, so replacing node_modules in
# place would delete the thing this stage exists to produce. That is exactly the
# bug this layout is written to avoid.
WORKDIR /prod
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/engine/package.json ./packages/engine/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci --omit=dev --workspace @claimcast/api --include-workspace-root

# The client, carried across from the tree it was generated in. `.prisma/client`
# is the generated code and `@prisma/client` is the shim that re-exports it;
# both have to match the schema the server was built against.
RUN rm -rf /prod/node_modules/.prisma /prod/node_modules/@prisma/client \
 && cp -r /app/node_modules/.prisma /prod/node_modules/.prisma \
 && cp -r /app/node_modules/@prisma/client /prod/node_modules/@prisma/client

# ── Runtime ──────────────────────────────────────────────────────────────

FROM node:22-slim
WORKDIR /app

# Prisma's query engine links against OpenSSL, which the slim image does not
# carry. Without it the first query fails with a message about a missing shared
# library rather than about the database.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    DOCUMENT_DIR=/tmp/vault \
    WEB_DIST=/app/web

COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/web/dist ./web

# Not root. This process accepts uploaded PDFs from anyone on the internet and
# has no reason to be able to write to its own filesystem.
RUN useradd --create-home --uid 10001 claimcast \
 && mkdir -p /tmp/vault \
 && chown -R claimcast /app /tmp/vault
USER claimcast

# Cloud Run assigns the port and expects the process to read it. The default is
# for anything else that runs this image.
ENV PORT=8080
EXPOSE 8080

# Uploads live on the container's own disk, which on Cloud Run is memory and
# vanishes when the instance does. That is the right storage for this: a
# schedule is read once, confirmed within the minute, and kept only long enough
# for the extraction to come back. Nothing depends on it surviving, and a
# financial document that disappears when the instance scales to zero is a
# better outcome than one that persists on a disk nobody is watching. The
# retention sweep still runs, for the instance that stays warm all afternoon.
CMD ["node", "dist/server.mjs"]

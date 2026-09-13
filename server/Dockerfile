# Builds the API as a self-contained image, for hosts that take a Dockerfile
# (Fly.io, a VPS, Railway) rather than building from source themselves.
#
# Build from the REPOSITORY ROOT, not from server/:
#   docker build -f server/Dockerfile -t aadarbahar-api .
#
# Note: this file is provided for self-hosting and has not been built end to
# end. The Render deployment in DEPLOYMENT.md does not use it.

# --- build ------------------------------------------------------------------
FROM node:22-slim AS build

# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependency manifests first, so a code-only change reuses the install layer.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm install --legacy-peer-deps --workspace server --include-workspace-root

COPY server ./server
RUN npm run build --workspace server

# Drop the build-only packages before they are copied into the final image.
RUN npm prune --omit=dev --legacy-peer-deps --workspace server --include-workspace-root

# --- run --------------------------------------------------------------------
FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma

# Run as the unprivileged user the base image already provides.
USER node

EXPOSE 4000
WORKDIR /app/server

# Applies any pending migrations, then starts. Safe to run on every boot.
CMD ["npm", "run", "start"]

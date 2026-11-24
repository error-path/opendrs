# The opendrs MCP server over stdio, for registries that build and introspect it (Glama) and for
# running it in a container. Mount the repository to score at /repo: docker run -i -v "$PWD:/repo" ...
# Base images are pinned by digest (multi-arch index); Dependabot bumps them.
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm ci --ignore-scripts && npm run build

FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
# opendrs reads history and diffs with git.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
# A mounted repository is owned by another user; let git read it anyway.
RUN git config --system --add safe.directory '*'
WORKDIR /repo
ENTRYPOINT ["node", "/app/dist/cli/index.js", "mcp"]

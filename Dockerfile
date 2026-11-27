# The opendrs MCP server over stdio, for registries that build and introspect it (Glama) and for
# running it in a container. Mount the repository to score at /repo: docker run -i -v "$PWD:/repo" ...
# Base images are pinned by digest (multi-arch index) to an LTS Node; Dependabot bumps the digest,
# not the major (see .github/dependabot.yml).
FROM node:24-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm ci --ignore-scripts && npm run build

FROM node:24-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530
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

FROM node:24-slim@sha256:c2d5ade763cacfb03fe9cb8e8af5d1be5041ff331921fa26a9b231ca3a4f780a AS base

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ curl gettext-base libsqlite3-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Build sqlite-vec extension
RUN echo "Building sqlite-vec extension..." && \
    mkdir -p /app/dist/extensions && \
    curl -sL "https://github.com/asg017/sqlite-vec/archive/refs/tags/v0.1.1.tar.gz" | tar xz -C /tmp && \
    cd /tmp/sqlite-vec-* && \
    VERSION=$(cat VERSION) && \
    DATE=$(date -r VERSION +'%FT%TZ%z' 2>/dev/null || date +'%FT%TZ%z') && \
    SOURCE="docker-build" && \
    export VERSION DATE SOURCE && \
    envsubst < sqlite-vec.h.tmpl > sqlite-vec.h && \
    ARCH=$(uname -m) && \
    CFLAGS="-O3 -Wall -Wextra" && \
    if [ "$ARCH" = "x86_64" ]; then \
      echo "Enabling AVX for x86_64" && \
      CFLAGS="$CFLAGS -mavx -DSQLITE_VEC_ENABLE_AVX"; \
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
      echo "Enabling NEON for ARM64" && \
      CFLAGS="$CFLAGS -DSQLITE_VEC_ENABLE_NEON"; \
    fi && \
    gcc -fPIC -shared -I. -DSQLITE_THREADSAFE=1 $CFLAGS \
        -o /app/dist/extensions/vec0.so sqlite-vec.c -lm && \
    echo "✓ Extension built: /app/dist/extensions/vec0.so" && \
    rm -rf /tmp/sqlite-vec-*

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dist/extensions ./dist/extensions
COPY . .

# Dummy values for build-time env validation (real values provided at runtime)
ENV SESSION_SECRET=build-time-dummy-value-not-for-production-use
ENV ADMIN_USERNAME=build
ENV ADMIN_PASSWORD_HASH=$2b$10$dummy.hash.for.build.time.validation.only

RUN corepack enable pnpm && pnpm build

# Next standalone NFT tracing keeps @img/sharp-libvips-* package metadata but
# often omits the dlopened libvips shared library. Overlay the host-arch natives
# from the full builder node_modules into every matching standalone package path.
RUN node <<'EOF'
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const archMap = {
  x64: "x64",
  arm64: "arm64",
  arm: "arm",
};
const arch = archMap[process.arch];
if (!arch) {
  throw new Error(`Unsupported sharp arch for overlay: ${process.arch}`);
}

const pkgName = `sharp-libvips-linux-${arch}`;
const sharpEntry = require.resolve("sharp");
const imgRoot = path.join(path.dirname(sharpEntry), "..", "..", "@img");
const srcPkg = path.join(imgRoot, pkgName);
const srcLib = path.join(srcPkg, "lib");
if (!fs.existsSync(srcLib)) {
  throw new Error(`Missing sharp libvips natives at ${srcLib}`);
}

const soName = fs
  .readdirSync(srcLib)
  .find((name) => name.startsWith("libvips-cpp.so."));
if (!soName) {
  throw new Error(`No libvips-cpp.so.* under ${srcLib}`);
}

const standaloneRoot = path.join("/app", ".next", "standalone");
const matches = execFileSync(
  "find",
  [standaloneRoot, "-type", "d", "-path", `*/@img/${pkgName}`],
  { encoding: "utf8" }
)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (matches.length === 0) {
  throw new Error(
    `No standalone @img/${pkgName} packages found under ${standaloneRoot}`
  );
}

for (const destPkg of matches) {
  const destLib = path.join(destPkg, "lib");
  fs.mkdirSync(destLib, { recursive: true });
  fs.cpSync(srcLib, destLib, { recursive: true, dereference: true });
  if (!fs.existsSync(path.join(destLib, soName))) {
    throw new Error(`Failed to overlay ${soName} into ${destLib}`);
  }
}

console.log(
  `sharp natives overlaid for ${arch}: ${soName} -> ${matches.length} @img location(s)`
);
EOF

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=builder /app/dist/extensions ./dist/extensions

# Verify better-sqlite3 native module is functional
RUN node -e "const sqlite = require('better-sqlite3'); const db = new sqlite(':memory:'); db.exec('CREATE TABLE test (id INTEGER)'); db.prepare('INSERT INTO test (id) VALUES (1)').run(); const row = db.prepare('SELECT * FROM test').get(); if (!row || row.id !== 1) { process.exit(1); } console.log('SQLite native module verification passed'); db.close();"

# Verify sharp can load its arch-specific libvips native bindings
RUN node -e "require('sharp'); console.log('sharp native module verification passed');"

# Create data directory for database
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS base

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ curl gettext-base && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build sqlite-vec extension
RUN echo "Building sqlite-vec extension..." && \
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
      CFLAGS="$CFLAGS -mcpu=apple-m1 -DSQLITE_VEC_ENABLE_NEON"; \
    fi && \
    gcc -fPIC -shared -I. -DSQLITE_THREADSAFE=1 $CFLAGS \
        -o /app/dist/extensions/vec0.so sqlite-vec.c -lm && \
    echo "✓ Extension built: /app/dist/extensions/vec0.so" && \
    rm -rf /tmp/sqlite-vec-*

RUN corepack enable pnpm && pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=builder /app/dist/extensions ./dist/extensions

# Verify better-sqlite3 native module is functional
RUN node -e "const sqlite = require('better-sqlite3'); const db = new sqlite(':memory:'); db.exec('CREATE TABLE test (id INTEGER)'); db.prepare('INSERT INTO test (id) VALUES (1)').run(); const row = db.prepare('SELECT * FROM test').get(); if (!row || row.id !== 1) { process.exit(1); } console.log('SQLite native module verification passed'); db.close();"

# Create data directory for database
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

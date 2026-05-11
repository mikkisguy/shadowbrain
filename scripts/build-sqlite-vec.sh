#!/bin/bash
set -e

# Build sqlite-vec as a loadable SQLite extension
# This script compiles sqlite-vec for the current platform

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SQLITE_VEC_VERSION="v0.1.1"
SQLITE_VEC_URL="https://github.com/asg017/sqlite-vec/archive/refs/tags/${SQLITE_VEC_VERSION}.tar.gz"
BUILD_DIR="$PROJECT_ROOT/build/sqlite-vec"
OUTPUT_DIR="$PROJECT_ROOT/dist/extensions"
EXTENSION_NAME="vec0"

mkdir -p "${BUILD_DIR}"
mkdir -p "${OUTPUT_DIR}"

echo "Downloading sqlite-vec ${SQLITE_VEC_VERSION}..."
curl -sL "${SQLITE_VEC_URL}" | tar xz -C "${BUILD_DIR}" --strip-components=1

cd "${BUILD_DIR}"

# Generate sqlite-vec.h from template
echo "Generating sqlite-vec.h..."
VERSION=$(cat VERSION)
DATE=$(date -r VERSION +'%FT%TZ%z' 2>/dev/null || date +'%FT%TZ%z')
SOURCE="manual-build"

export VERSION DATE SOURCE
envsubst < sqlite-vec.h.tmpl > sqlite-vec.h

echo "Compiling sqlite-vec as loadable extension..."
# Detect CPU architecture for SIMD flags
ARCH=$(uname -m)
CFLAGS="-O3 -Wall -Wextra"

if [ "$ARCH" = "x86_64" ]; then
    echo "Enabling AVX for x86_64"
    CFLAGS="$CFLAGS -mavx -DSQLITE_VEC_ENABLE_AVX"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    echo "Enabling NEON for ARM64"
    CFLAGS="$CFLAGS -mcpu=apple-m1 -DSQLITE_VEC_ENABLE_NEON"
fi

gcc -fPIC -shared \
    -I. \
    -DSQLITE_THREADSAFE=1 \
    $CFLAGS \
    -o "${OUTPUT_DIR}/${EXTENSION_NAME}.so" \
    sqlite-vec.c \
    -lm

echo "✓ Extension built: ${OUTPUT_DIR}/${EXTENSION_NAME}.so"

# Verify the extension
echo "Verifying extension..."
file "${OUTPUT_DIR}/${EXTENSION_NAME}.so"

cd -

# Clean up build artifacts
rm -rf "${BUILD_DIR}"

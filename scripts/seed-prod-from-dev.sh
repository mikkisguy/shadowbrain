#!/usr/bin/env bash
#
# Seed the production Docker named volume from a local/dev SQLite DB + images.
#
# Takes a consistent sqlite3 .backup of the source DB, copies it (as
# shadowbrain.db) and data/images into the named volume, then optionally
# restarts the compose stack. Overwrites whatever is already in the volume.
#
# USAGE
#   scripts/seed-prod-from-dev.sh              # interactive confirm
#   scripts/seed-prod-from-dev.sh --yes        # no prompt
#   scripts/seed-prod-from-dev.sh --dry-run    # print plan only
#
# ENV OVERRIDE
#   SOURCE_DB       ... source SQLite file (default <repo>/data/shadowbrain.dev.db)
#   IMAGES_DIR      ... images tree to copy (default <repo>/data/images)
#   VOLUME_NAME     ... Docker volume (default shadowbrain_shadowbrain_data)
#   COMPOSE_DIR     ... dir with docker-compose.yml (default /home/nodeuser/shadowbrain)
#   COMPOSE_CMD     ... compose binary (default "docker compose")
#   APP_UID / APP_GID ... ownership inside volume (default 1001 / 1001)
#
# EXIT CODES
#   0 = success   1 = usage/precondition error   2 = aborted by user
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SOURCE_DB="${SOURCE_DB:-$REPO_ROOT/data/shadowbrain.dev.db}"
IMAGES_DIR="${IMAGES_DIR:-$REPO_ROOT/data/images}"
VOLUME_NAME="${VOLUME_NAME:-shadowbrain_shadowbrain_data}"
COMPOSE_DIR="${COMPOSE_DIR:-/home/nodeuser/shadowbrain}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"
APP_UID="${APP_UID:-1001}"
APP_GID="${APP_GID:-1001}"

YES=0
DRY_RUN=0

usage() {
  sed -n '2,28p' "$0" | sed 's/^# \?//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes | -y) YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h | --help) usage ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
      ;;
  esac
  shift
done

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1" >&2
    exit 1
  fi
}

need sqlite3
need docker

if [[ ! -f "$SOURCE_DB" ]]; then
  echo "ERROR: source DB not found: $SOURCE_DB" >&2
  exit 1
fi

if [[ ! -d "$IMAGES_DIR" ]]; then
  echo "ERROR: images directory not found: $IMAGES_DIR" >&2
  exit 1
fi

if ! docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
  echo "ERROR: Docker volume not found: $VOLUME_NAME" >&2
  echo "Create it by starting the compose stack once, or set VOLUME_NAME." >&2
  exit 1
fi

ITEM_COUNT="$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM content_items;" 2>/dev/null || echo "?")"
IMAGE_FILES="$(find "$IMAGES_DIR" -type f | wc -l | tr -d ' ')"
DB_SIZE="$(du -h "$SOURCE_DB" | awk '{print $1}')"
IMG_SIZE="$(du -sh "$IMAGES_DIR" | awk '{print $1}')"

echo "Seed plan"
echo "  source DB : $SOURCE_DB ($DB_SIZE, ~$ITEM_COUNT content_items)"
echo "  images    : $IMAGES_DIR ($IMG_SIZE, $IMAGE_FILES files)"
echo "  volume    : $VOLUME_NAME  →  /data/shadowbrain.db + /data/images"
echo "  ownership : ${APP_UID}:${APP_GID}"
echo "  compose   : $COMPOSE_DIR ($COMPOSE_CMD)"
echo ""
echo "WARNING: This OVERWRITES the database and images in '$VOLUME_NAME'."
echo ""

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run — no changes made."
  exit 0
fi

if [[ "$YES" -ne 1 ]]; then
  read -r -p "Type 'seed' to continue: " confirm
  if [[ "$confirm" != "seed" ]]; then
    echo "Aborted."
    exit 2
  fi
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/shadowbrain-seed.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

SEED_DB="$WORKDIR/shadowbrain.db"
SEED_IMAGES="$WORKDIR/images"

echo "→ Consistent snapshot via sqlite3 .backup"
sqlite3 "$SOURCE_DB" ".backup '$SEED_DB'"

echo "→ Staging images"
mkdir -p "$SEED_IMAGES"
cp -a "$IMAGES_DIR"/. "$SEED_IMAGES"/

COMPOSE_FILE=""
if [[ -f "$COMPOSE_DIR/docker-compose.yml" ]]; then
  COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
elif [[ -f "$COMPOSE_DIR/compose.yml" ]]; then
  COMPOSE_FILE="$COMPOSE_DIR/compose.yml"
fi

APP_RUNNING=0
if docker ps --format '{{.Names}}' | grep -qx 'shadowbrain-app'; then
  APP_RUNNING=1
fi

if [[ "$APP_RUNNING" -eq 1 ]]; then
  if [[ -n "$COMPOSE_FILE" ]]; then
    echo "→ Stopping compose stack ($COMPOSE_DIR)"
    $COMPOSE_CMD --project-directory "$COMPOSE_DIR" down
  else
    echo "→ Stopping container shadowbrain-app"
    docker stop shadowbrain-app >/dev/null
  fi
fi

echo "→ Writing into volume $VOLUME_NAME"
docker run --rm \
  -v "$VOLUME_NAME":/data \
  -v "$WORKDIR":/seed:ro \
  alpine sh -c "
    set -e
    rm -f /data/shadowbrain.db /data/shadowbrain.db-wal /data/shadowbrain.db-shm
    cp /seed/shadowbrain.db /data/shadowbrain.db
    mkdir -p /data/images
    # Remove existing image files only (keep directory)
    find /data/images -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a /seed/images/. /data/images/
    chown -R ${APP_UID}:${APP_GID} /data
    echo '  volume contents:'
    ls -la /data
    echo -n '  images files: '
    find /data/images -type f | wc -l
  "

if [[ "$APP_RUNNING" -eq 1 ]]; then
  if [[ -n "$COMPOSE_FILE" ]]; then
    echo "→ Starting compose stack"
    $COMPOSE_CMD --project-directory "$COMPOSE_DIR" up -d
  else
    echo "→ Compose dir missing ($COMPOSE_DIR); start the app manually."
  fi
fi

echo ""
echo "Done. Verify in the UI, then run /backup so Proton Drive has a prod snapshot."
echo "Volume: $VOLUME_NAME  |  items from source: $ITEM_COUNT  |  images: $IMAGE_FILES"

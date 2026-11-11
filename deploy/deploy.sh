#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=.env
RELEASES_LOG=releases.log

usage() {
  echo "usage: deploy.sh --image <registry/name@sha256:digest>" >&2
  exit 2
}

read_env() {
  { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2-
}

write_env() {
  local key=$1 value=$2 tmp
  tmp=$(mktemp "$ENV_FILE.XXXXXX")
  { grep -v -E "^${key}=" "$ENV_FILE" || true; } > "$tmp"
  echo "${key}=${value}" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
}

log_release() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$RELEASES_LOG"
}

rollout() {
  docker compose pull &&
    docker compose up -d migrate &&
    docker compose up -d app worker &&
    docker compose run --rm --no-deps app node dist/deploy-poll.mjs --url http://app:3000 --expect-image "$1"
}

restore_help() {
  echo "restore the backup taken before this deploy, then run ./deploy.sh --image $1 again. The steps are under Backups and restore in the operations documentation."
}

database_migration_head() {
  docker compose exec -T postgres psql -U chiban -d chiban -tA \
    -c "select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations" 2>/dev/null |
    tr -d '[:space:]'
}

image_migration_head() {
  docker run --rm --entrypoint cat "$1" /app/drizzle/meta/_journal.json 2>/dev/null |
    sed -n 's/.*"when": *\([0-9][0-9]*\).*/\1/p' | sort -n | tail -n 1
}

is_count() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

rollback() {
  local previous=$1 failed=$2 database_head image_head
  if [ -z "$previous" ]; then
    log_release "failed_no_previous image=$failed"
    return 0
  fi
  database_head=$(database_migration_head || true)
  image_head=$(image_migration_head "$previous" || true)
  if is_count "$database_head" && is_count "$image_head"; then
    if [ "$database_head" -gt "$image_head" ]; then
      echo "Not rolling back to $previous. The new image applied database migrations that $previous does not know, and starting it against them could damage records. The failed image stays in $ENV_FILE. Deploy a fixed image, or $(restore_help "$previous")" >&2
      log_release "rollback_refused image=$previous failed=$failed database_head=$database_head image_head=$image_head"
      return 0
    fi
    echo "Rolling back the application image only, to $previous. The database is not rolled back. It has no migrations newer than that image, so the image can run against it." >&2
  else
    echo "Rolling back the application image only, to $previous. The database is not rolled back, and this script could not check whether the new image applied migrations that $previous does not know. If it did, $(restore_help "$previous")" >&2
  fi
  write_env CHIBAN_IMAGE "$previous"
  docker compose up -d app worker
  log_release "rolled_back image=$previous failed=$failed"
}

[ "${1:-}" = "--image" ] || usage
image=${2:-}
[ -n "$image" ] || usage
[ -z "${3:-}" ] || usage

if [[ "$image" != *@sha256:* ]]; then
  echo "image must be pinned by digest (name@sha256:...)" >&2
  exit 2
fi

previous=$(read_env CHIBAN_IMAGE)
write_env CHIBAN_IMAGE_PREVIOUS "$previous"
write_env CHIBAN_IMAGE "$image"
log_release "image=$image previous=$previous"

if rollout "$image"; then
  docker image prune -a -f --filter until=168h
  exit 0
fi

rollback "$previous" "$image"
exit 1

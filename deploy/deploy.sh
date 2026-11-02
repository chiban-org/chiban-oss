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

rollback() {
  local previous=$1
  if [ -z "$previous" ]; then
    log_release "failed_no_previous image=$2"
    return 0
  fi
  write_env CHIBAN_IMAGE "$previous"
  docker compose up -d app worker
  log_release "rolled_back image=$previous failed=$2"
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

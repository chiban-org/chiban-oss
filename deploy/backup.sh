#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=.env
BACKUP_DIR=backups

usage() {
  echo "usage: backup.sh [--verify]" >&2
  exit 2
}

read_env() {
  [ -f "$ENV_FILE" ] || return 0
  { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2-
}

verify=0
case "${1:-}" in
  "") ;;
  --verify) verify=1 ;;
  *) usage ;;
esac
if [ "$#" -gt 1 ]; then
  usage
fi

passphrase="${BACKUP_PASSPHRASE:-}"
if [ -z "$passphrase" ]; then
  passphrase=$(read_env BACKUP_PASSPHRASE)
fi
if [ -z "$passphrase" ]; then
  echo "BACKUP_PASSPHRASE is empty. Set it in the environment or in $ENV_FILE (at least 16 characters)." >&2
  exit 1
fi
export BACKUP_PASSPHRASE="$passphrase"

mkdir -p "$BACKUP_DIR"

output=$(docker compose run --rm --no-deps -T \
  -e BACKUP_PASSPHRASE \
  -v "$PWD/$BACKUP_DIR:/srv/target/$BACKUP_DIR" \
  app node dist/backup.mjs --dir /srv/target)

file=$(printf '%s\n' "$output" | sed -n 's/^wrote //p' | tail -n 1)
if [ -z "$file" ]; then
  echo "the backup did not report a file" >&2
  exit 1
fi
echo "$file"

if [ "$verify" -eq 1 ]; then
  ./restore-verify.sh "$file"
fi

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=.env
BACKUP_DIR=backups

usage() {
  echo "usage: restore-verify.sh [--keep] [backup-file]" >&2
  exit 2
}

read_env() {
  [ -f "$ENV_FILE" ] || return 0
  { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2-
}

keep=""
file=""
for arg in "$@"; do
  case "$arg" in
    --keep) keep="--keep" ;;
    -*) usage ;;
    *)
      if [ -n "$file" ]; then
        usage
      fi
      file=$arg
      ;;
  esac
done

passphrase="${BACKUP_PASSPHRASE:-}"
if [ -z "$passphrase" ]; then
  passphrase=$(read_env BACKUP_PASSPHRASE)
fi
if [ -z "$passphrase" ]; then
  echo "BACKUP_PASSPHRASE is empty. Set it to the passphrase the backup was made with." >&2
  exit 1
fi
export BACKUP_PASSPHRASE="$passphrase"

if [ -z "$file" ]; then
  file=$({ ls -1 "$BACKUP_DIR"/chiban-backup-*.bin 2>/dev/null || true; } | tail -n 1)
fi
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "no backup file found" >&2
  exit 1
fi
absolute="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"

docker compose run --rm --no-deps -T \
  -e BACKUP_PASSPHRASE \
  -v "$absolute:/restore/backup.bin:ro" \
  app node dist/restore-verify.mjs --file /restore/backup.bin ${keep:+"$keep"}

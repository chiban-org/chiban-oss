#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=.env

read_env() {
  [ -f "$ENV_FILE" ] || return 0
  { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2-
}

usage() {
  echo "usage: verify-anonymous-intake.sh --backup-dir <folder holding the nightly backups>" >&2
  exit 2
}

backup_dir=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup-dir)
      [ "$#" -ge 2 ] || usage
      backup_dir=$2
      shift 2
      ;;
    *) usage ;;
  esac
done

if [ -z "$backup_dir" ]; then
  echo "backup_missing: pass --backup-dir <folder>. The check reads the newest nightly backup, and without one it cannot pass." >&2
  exit 2
fi
if [ ! -d "$backup_dir" ]; then
  echo "backup_missing: $backup_dir is not a folder." >&2
  exit 1
fi
backup_dir=$(cd "$backup_dir" && pwd)

passphrase="${BACKUP_PASSPHRASE:-}"
if [ -z "$passphrase" ]; then
  passphrase=$(read_env BACKUP_PASSPHRASE)
fi
if [ -z "$passphrase" ]; then
  echo "BACKUP_PASSPHRASE is empty. Set it in the environment or in $ENV_FILE. The check decrypts the newest backup with it." >&2
  exit 1
fi
export BACKUP_PASSPHRASE="$passphrase"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod 755 "$work"

started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose run --rm --no-deps -T app node dist/anonymous-intake-verify.mjs submit > "$work/submit.json"
control=$(sed -n 's/.*"controlQuery":"\([^"]*\)".*/\1/p' "$work/submit.json")
if [ -z "$control" ]; then
  echo "the submission step did not report a control request" >&2
  exit 1
fi

docker compose logs --no-color --since "$started" caddy app worker > "$work/all.log" 2>&1
client_ip=$(grep -F "$control" "$work/all.log" | sed -n 's/.*"remote_ip":"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$client_ip" ]; then
  echo "the control request is not in the Caddy access log, so logging was off during the run and the check proves nothing" >&2
  exit 1
fi
grep -vF "$control" "$work/all.log" > "$work/logs.txt" || true

docker compose run --rm --no-deps -T \
  -e BACKUP_PASSPHRASE \
  -v "$work:/srv/probe:ro" \
  -v "$backup_dir:/srv/backups:ro" \
  app node dist/anonymous-intake-verify.mjs check \
  --markers /srv/probe/submit.json \
  --client-ip "$client_ip" \
  --logs /srv/probe/logs.txt \
  --backup-dir /srv/backups \
  --caddyfile-sha256 "$(sha256_of Caddyfile)"

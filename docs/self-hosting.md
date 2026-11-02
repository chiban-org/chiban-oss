# Self-hosting Chiban

This guide covers running one town's Chiban on a single Linux host with Docker Compose. The stack is a reverse proxy (Caddy), the application, a background worker, a one-shot migration step, PostgreSQL with PostGIS, and S3-compatible object storage (MinIO).

## Requirements

- A Linux host with Docker Engine and the Compose plugin.
- Ports 80 and 443 open to the internet. No other port is published.
- A domain name you control, for example `town.example.org`.
- An SMTP account the application can send mail through.

## DNS

Create two records pointing at the host's public address:

| Name | Purpose |
| --- | --- |
| `APP_DOMAIN` (for example `town.example.org`) | The application |
| `s3.APP_DOMAIN` (for example `s3.town.example.org`) | Object storage, used for file uploads and downloads |

Caddy requests and renews certificates for both names automatically, so both records must resolve to the host before the first start.

## Configuration

Copy the example file and edit it:

```
cd deploy
cp .env.example .env
chmod 600 .env
```

Set at least:

- `APP_DOMAIN` and `BASE_URL`. `BASE_URL` is `https://` followed by the domain.
- `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD`. Use long random values made of letters and digits, because they are embedded in connection URLs.
- `SMTP_URL` and `MAIL_FROM` for outgoing mail.
- `CHIBAN_SECRET_KEYS` and `CHIBAN_ACTIVE_KEY_ID`. The keys value is a JSON object that maps a key id to a base64 encoding of exactly 32 random bytes, for example the output of `openssl rand -base64 32`. Keep a copy of this value somewhere safe: encrypted data cannot be read without it.

The application refuses to start if it finds a setting whose name begins with one of its own prefixes (`CHIBAN_`, `S3_`, `SMTP_`, `HEALTH_`, `ALERT_`, `PAGER_`, `EXPORT_`, `GHOSTSCRIPT_`) and does not recognise it, so a misspelled setting is reported at startup instead of being ignored.

`CHIBAN_IMAGE` is managed by the deploy script. The value in the example file is a placeholder.

## Images

Every image in `deploy/docker-compose.yml` is a variable, and every value in `.env.example` is pinned by digest (`@sha256:...`):

| Variable | Used for |
| --- | --- |
| `CHIBAN_IMAGE` | The application, worker, and migration step |
| `POSTGIS_IMAGE` | PostgreSQL 16 with PostGIS |
| `MINIO_IMAGE` | Object storage |
| `MC_IMAGE` | The one-shot step that creates the storage bucket |
| `CADDY_IMAGE` | The reverse proxy |

The PostgreSQL major version must stay at 16 to match the client tools inside the application image.

### Object storage image and mirroring

The upstream `minio/minio` image can no longer be pulled without a registry login, so the example file points `MINIO_IMAGE` at the Chainguard build, which pulls anonymously:

```
MINIO_IMAGE=cgr.dev/chainguard/minio@sha256:0a01100085e30fb08d2f39e39c9f5c9d83a95707f220b007d813b690cd41622d
MC_IMAGE=cgr.dev/chainguard/minio-client@sha256:3b67177c0e12f44f646a5cf21b20fc5a79dd2d7a6b4db632b436f0b9e2e46717
```

To serve these from your own registry instead, copy each image with its digest preserved and change the variable to the new reference:

```
docker pull cgr.dev/chainguard/minio@sha256:0a01100085e30fb08d2f39e39c9f5c9d83a95707f220b007d813b690cd41622d
docker tag cgr.dev/chainguard/minio@sha256:0a01100085e30fb08d2f39e39c9f5c9d83a95707f220b007d813b690cd41622d registry.example.org/mirror/minio:pinned
docker push registry.example.org/mirror/minio:pinned
```

Pushing prints the digest of the copy in your registry. Put that value in `.env`, for example `MINIO_IMAGE=registry.example.org/mirror/minio@sha256:<digest>`. A tool such as `skopeo copy --all` or `crane copy` preserves digests exactly and is a good fit for this. The same steps apply to the other third-party images. Run `docker login` on the host first if your registry needs credentials.

The MinIO image runs as an unprivileged user (uid 65532). A new named Docker volume is writable by that user, so no extra permission setup is needed on a fresh install.

## First deploy

From the `deploy` directory, with `.env` filled in, run the deploy script with the application image reference. The reference must include a digest:

```
./deploy.sh --image registry.example.org/chiban@sha256:<digest>
```

The script:

1. Refuses a reference that is not pinned by digest.
2. Records the current image as `CHIBAN_IMAGE_PREVIOUS` in `.env`, writes the new image as `CHIBAN_IMAGE`, and appends a line to `releases.log`.
3. Pulls images, creates the storage bucket, applies database migrations, and starts the application and worker.
4. Polls the application until `/api/health` answers and `/api/version` reports the image you asked for. The default limit is two minutes.
5. On success, removes images older than seven days that no container uses.
6. On failure, restores the previous image, restarts the application and worker on it, appends a `rolled_back` line to `releases.log`, and exits with status 1. On the very first deploy there is no previous image, so the script records `failed_no_previous` and exits with status 1.

Run the same command with a new digest to upgrade.

You can check what is running at any time:

```
docker compose ps
curl https://town.example.org/api/version
```

The version response includes the image reference, the pack identity, and the migration head.

## Anonymous complaints

The anonymous complaint form lives at `/report-anonymously` and posts to `/intake/anonymous`. The bundled Caddyfile writes an access log for the main site and skips it for those two paths, for the page assets under `/_next/`, and for `/favicon.ico`, so no address or request line for an anonymous complaint is kept.

If a load balancer, CDN, or any other proxy sits in front of Caddy, it must skip logging for the same two path prefixes. If it cannot, do not put it in front of this deployment: the retention verification below will pass on Caddy's own logs and still miss a log that Chiban cannot see.

### Verifying anonymous intake

The anonymous complaint route answers 404 until the town has a passing verification for the exact image that is running. A new image closes the route again until it is verified.

Run the verification on the host after every deploy, with the folder that holds the nightly backups:

```
./verify-anonymous-intake.sh --backup-dir /path/to/backups
```

The script submits one probe complaint through the public address, as a signed-in visitor with a photo that carries location and author data. It then looks for the probe's address, browser name, file name, photo author, and the visitor's account in the database, the Caddy, app, and worker logs, object storage, and the newest nightly backup. A control request that must appear in the Caddy access log proves logging was on during the run. The probe is deleted afterward. Without `--backup-dir`, or with a folder that holds no backup, the check fails with `backup_missing`.

When it passes, an administrator turns anonymous intake on from the Anonymous intake page under Admin. The switch stays off until then.

## Exports

Staff with export permission can request a full export of the town's records from the export page at `/staff/admin/export`. An export is a single archive that includes the data, the uploaded documents, and a description of the format, which is also published in `docs/export-format.md`. Downloads are served through the `s3.APP_DOMAIN` name, so that record must resolve for the download link to work.

## Backups

A backup covers the whole recovery unit in one encrypted file: the database, every file in object storage (except the `exports/` folder, which only holds downloads that can be made again), and the secret keys the application uses to read saved credentials. Nothing readable is left on disk or in the destination.

### Set the passphrase

Set `BACKUP_PASSPHRASE` in `deploy/.env` to a passphrase of at least 16 characters. The scripts refuse to run when it is empty. Keep the passphrase and a copy of `CHIBAN_SECRET_KEYS` somewhere other than the backups themselves, for example in the town's password manager. A backup cannot be opened without its passphrase, and the keys inside the backup are not a substitute for a separate copy.

### Nightly backup

`deploy/backup.sh` writes `deploy/backups/chiban-backup-YYYY-MM-DD.bin`. Run it from cron:

```
15 2 * * * cd /opt/chiban/deploy && ./backup.sh >> backup.log 2>&1
```

To send backups to a configured export target instead of the local folder, run `node dist/backup.mjs --target "Target name"` inside the app image. Targets are managed at `/staff/admin/export/targets`.

The tool never deletes old files. Keep several nights, and copy the folder off the host regularly. Prune old files with your own schedule.

### Monthly restore check

A backup that has never been restored is not proven. `deploy/restore-verify.sh` decrypts a backup, restores the database into a temporary database on the same server, copies the files into a temporary bucket, compares every table with the live town, re-hashes every stored document, and then removes the temporary database and bucket. It exits 0 only when everything matches.

Run it right after a fresh backup, because rows that changed since the backup show up as differences. `./backup.sh --verify` does both:

```
0 4 1 * * cd /opt/chiban/deploy && ./backup.sh --verify >> restore-verify.log 2>&1
```

To check an older file, run `./restore-verify.sh backups/chiban-backup-YYYY-MM-DD.bin`. The report lists any table that differs.

### Restoring for real

1. On the new host, install the stack as described above with the same `CHIBAN_SECRET_KEYS` and `CHIBAN_ACTIVE_KEY_ID` (they are also inside the backup in `secrets.json`), but start only `postgres` and `minio`.
2. Decrypt the backup. The passphrase is typed at the terminal:

   ```
   mkdir -p restore
   docker compose run --rm --no-deps -v "$PWD/backups:/in" -v "$PWD/restore:/out" app node dist/chiban-recover.mjs decrypt --in /in/chiban-backup-YYYY-MM-DD.bin --out /out/backup.tar
   tar -xf restore/backup.tar -C restore
   ```

3. Restore the database:

   ```
   docker compose exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges -U chiban -d chiban < restore/database.dump
   ```

4. Copy the files back into the bucket:

   ```
   docker compose run --rm --no-deps -v "$PWD/restore/objects:/objects" --entrypoint mc createbucket mirror /objects local/chiban
   ```

5. Delete the `restore` folder, which now holds readable copies, and start the application with `docker compose up -d`.

The mirroring advice for the object storage image above applies to backups too: keep a mirrored copy of the pinned images, so a restore does not depend on a registry being reachable.

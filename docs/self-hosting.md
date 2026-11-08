# Self-hosting Chiban

This guide covers running one town's Chiban on a single Linux host with Docker Compose. The stack is a reverse proxy (Caddy), the application, a background worker, a one-shot migration step, PostgreSQL with PostGIS, and S3-compatible object storage (Garage).

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
- `POSTGRES_PASSWORD` and `S3_SECRET_ACCESS_KEY`. Use long random values made of letters and digits, because they are embedded in connection URLs.
- `S3_ACCESS_KEY_ID`, the name of the storage access key. It must be at least 8 characters long.
- `GARAGE_RPC_SECRET`, exactly 64 hexadecimal characters, for example the output of `openssl rand -hex 32`.
- `GARAGE_ADMIN_TOKEN`, a long random value. Only the storage setup step uses it.
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
| `GARAGE_IMAGE` | Object storage |
| `CADDY_IMAGE` | The reverse proxy |

The PostgreSQL major version must stay at 16 to match the client tools inside the application image.

### Mirroring images

The example file pins every image by digest, for example the Garage object store from Docker Hub:

```
GARAGE_IMAGE=dxflrs/garage:v2.5.0@sha256:677e5b758e4425a325b811c425c026bf35a4bf42f7ddbaa773de3f4fd779a5a5
```

To serve an image from your own registry instead, copy it with its digest preserved and change the variable to the new reference:

```
docker pull dxflrs/garage:v2.5.0@sha256:677e5b758e4425a325b811c425c026bf35a4bf42f7ddbaa773de3f4fd779a5a5
docker tag dxflrs/garage:v2.5.0@sha256:677e5b758e4425a325b811c425c026bf35a4bf42f7ddbaa773de3f4fd779a5a5 registry.example.org/mirror/garage:pinned
docker push registry.example.org/mirror/garage:pinned
```

Pushing prints the digest of the copy in your registry. Put that value in `.env`, for example `GARAGE_IMAGE=registry.example.org/mirror/garage@sha256:<digest>`. A tool such as `skopeo copy --all` or `crane copy` preserves digests exactly and is a good fit for this. The same steps apply to the other third-party images. Run `docker login` on the host first if your registry needs credentials.

Garage v2.5 cannot be downgraded once it has written its data, so change `GARAGE_IMAGE` to an older version only together with a restore from backup.

## Object storage

Object storage is [Garage](https://garagehq.deuxfleurs.fr), configured by `deploy/garage.toml`. The file holds no secret: Garage reads `GARAGE_RPC_SECRET` and `GARAGE_ADMIN_TOKEN` from the environment. What to know before you rely on it:

- It runs as one node with no replication (`replication_factor = 1`), and its metadata and file data live in the `garagedata` volume. If that disk is lost, the files are gone except for what is in your backups, so keep the nightly backups below and copy them off the host.
- Metadata is kept in SQLite with `metadata_fsync` and `data_fsync` on, which trades some write speed for surviving a power cut.
- On its first start Garage creates the access key named by `S3_ACCESS_KEY_ID` with the secret in `S3_SECRET_ACCESS_KEY`. After that it refuses to start if `S3_SECRET_ACCESS_KEY` no longer matches, and it never accepts a deleted key name again. To rotate the credentials, pick a new `S3_ACCESS_KEY_ID` and a new `S3_SECRET_ACCESS_KEY` together, then run `docker compose up -d` and `docker compose run --rm storageinit` so the new key gets access to the bucket. Remove the old key afterwards with `docker compose exec garage /garage key delete --yes <old key name>`.
- The `storageinit` step creates the bucket through Garage's admin API, grants the access key read, write, and owner rights on it, and sets the bucket's browser upload rule (CORS) to the origin of `BASE_URL`. Every deploy runs it again, so after changing `BASE_URL` the next deploy updates the rule. The admin API listens on port 3903 inside the Compose network only, and only `storageinit` is given the token.
- An expired download link is answered with status 400 (`Date is too old`) rather than 403.

## First deploy

From the `deploy` directory, with `.env` filled in, run the deploy script with the application image reference. The reference must include a digest:

```
./deploy.sh --image registry.example.org/chiban@sha256:<digest>
```

The script:

1. Refuses a reference that is not pinned by digest.
2. Records the current image as `CHIBAN_IMAGE_PREVIOUS` in `.env`, writes the new image as `CHIBAN_IMAGE`, and appends a line to `releases.log`.
3. Pulls images, starts object storage and prepares its bucket, applies database migrations, and starts the application and worker.
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

Staff with export permission can request a full export of the town's records from the export page at `/staff/admin/export`. An export is a single archive that includes the data as NDJSON, CSV files and an Excel workbook, the uploaded documents with a PDF/A copy of each PDF, and a description of the format, which is also published in `docs/export-format.md`. Downloads are served through the `s3.APP_DOMAIN` name, so that record must resolve for the download link to work.

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

1. On the new host, install the stack as described above with the same `CHIBAN_SECRET_KEYS` and `CHIBAN_ACTIVE_KEY_ID` (they are also inside the backup in `secrets.json`), but start only `postgres` and `garage`.
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

4. Create the bucket, then copy the files back into it:

   ```
   docker compose run --rm storageinit
   docker compose run --rm --no-deps -v "$PWD/restore/objects:/objects:ro" app node dist/restore-objects.mjs --dir /objects
   ```

5. Delete the `restore` folder, which now holds readable copies, and start the application with `docker compose up -d`.

The mirroring advice for the object storage image above applies to backups too: keep a mirrored copy of the pinned images, so a restore does not depend on a registry being reachable.

### Moving an existing install from MinIO

Installs made before the switch to Garage keep their files in the old `miniodata` volume. To move them:

1. Stop the application and worker with `docker compose stop app worker`, so no file is written to MinIO after the backup is taken.
2. Take a backup with `./backup.sh` and decrypt it as in step 2 above.
3. Update the deploy files, then in `.env` replace `MINIO_IMAGE`, `MC_IMAGE`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD` with the settings from the current `.env.example`: `GARAGE_IMAGE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `GARAGE_RPC_SECRET`, and `GARAGE_ADMIN_TOKEN`.
4. Deploy an image that includes Garage support with `./deploy.sh --image ...`. The deploy script does not restart Caddy, so recreate it to load the new storage upstream: `docker compose up -d --force-recreate caddy`. Existing documents do not open until the next step.
5. Copy the files in with the second command of step 4 above. The database does not change.
6. Once the town's documents open, remove the old containers and volume with `docker compose up -d --remove-orphans` and `docker volume rm <project>_miniodata`.

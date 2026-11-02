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

## Exports

Staff with export permission can request a full export of the town's records from the export page at `/staff/admin/export`. An export is a single archive that includes the data, the uploaded documents, and a description of the format, which is also published in `docs/export-format.md`. Downloads are served through the `s3.APP_DOMAIN` name, so that record must resolve for the download link to work.

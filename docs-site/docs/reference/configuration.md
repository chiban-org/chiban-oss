---
title: "Configuration"
description: "Every setting Chiban reads from its environment."
generated: true
generated_by: "pnpm docs:generate"
generated_from:
  - "src/config/envSchema.ts"
  - "src/config/envDocs.ts"
  - "src/config/envStrict.ts"
---

# Configuration

This page is for whoever runs the Chiban server. It lists every setting the application, the worker and the command-line tools read from their environment.

Chiban checks these settings when it starts and refuses to start when one is invalid. It also refuses to start when it finds a setting whose name begins with one of its own prefixes and that it does not recognise, so a misspelled setting is reported instead of ignored. The prefixes are `CHIBAN_`, `S3_`, `SMTP_`, `HEALTH_`, `ALERT_`, `PAGER_`, `EXPORT_`, `GHOSTSCRIPT_`, `BACKUP_` and `USPS_`.

For development, the settings go in `.env` at the repository root, copied from `.env.example`. The bundled deployment passes only the settings listed in `deploy/docker-compose.yml` to the application, the worker and the migration step. To use any other setting there, add it to those services. The guide to [self-hosting](../operations/self-hosting.md) covers the deployment settings, such as `APP_DOMAIN` and `POSTGRES_PASSWORD`, that only the Compose file reads.

## Application

### `NODE_ENV`

Optional. Default: `development`. Accepts `development`, `test` or `production`.

The mode the application runs in. The application image sets `production`. Several development aids refuse to run in production.

### `PORT`

Optional. Default: `3000`. Whole number greater than zero.

The port the web application listens on. Next.js reads it when the server starts.

### `LOG_LEVEL`

Optional. Default: `info`. Accepts `debug`, `info`, `warn` or `error`.

Accepted and checked at startup. No part of Chiban reads it at present.

### `DATABASE_URL`

Required. Text.

The PostgreSQL connection URL. The database needs the PostGIS extension.

### `BASE_URL`

Required. URL.

The public address of the application, for example `https://town.example.org`. Links in email and the browser upload rule for object storage are built from it.

### `CHIBAN_SECRET_KEYS`

Required. Text.

A JSON object that maps a key id to a base64 encoding of exactly 32 random bytes. Saved credentials, such as payment processor keys, authenticator app secrets and export target secrets, are encrypted with these keys. Keep a copy outside the server: encrypted data cannot be read without it.

### `CHIBAN_ACTIVE_KEY_ID`

Required. Text matching `^[A-Za-z0-9_-]{1,32}$`.

The id of the key in `CHIBAN_SECRET_KEYS` used to encrypt new values. Older keys stay in the object so existing values can still be read.

- `CHIBAN_ACTIVE_KEY_ID` must name a key present in CHIBAN_SECRET_KEYS.

### `CHIBAN_IMAGE_REF`

Optional. No default. Text.

The application image reference, pinned by digest. The bundled Compose file sets it from `CHIBAN_IMAGE`. Anonymous complaint intake opens only when a passing verification exists for this exact image.

### `MAX_UPLOAD_BYTES`

Optional. Default: `104857600`. Whole number greater than zero.

The largest file a person can upload, in bytes. The default is 100 MiB.

### `PATH`

Optional. No default. Text.

The usual executable search path. It is passed on to the database dump tool when a recovery export is built.

### `NEXT_RUNTIME`

Optional. No default. Accepts `nodejs` or `edge`.

Set by Next.js itself. Do not set it.

## Mail

### `SMTP_URL`

Optional. Default: `smtp://localhost:1025`. Text.

The SMTP server outgoing mail is sent through, as a URL such as `smtp://user:password@mail.example.org:587`.

- `SMTP_URL` must point at a host in CHIBAN_DEMO_MAIL_SINK_HOSTS, with no query options, when CHIBAN_DEMO_MODE is on.

### `MAIL_FROM`

Optional. Default: `Town of Alder Pond <noreply@alderpond.example>`. Text, at least 3 characters.

The sender of every email Chiban sends, including calendar invitations.

## Object storage

### `S3_ENDPOINT`

Optional. Default: `http://localhost:9010`. URL.

The address the application and worker use to reach object storage.

### `S3_PUBLIC_ENDPOINT`

Optional. Default: `http://localhost:9010`. URL.

The address browsers use for upload and download links. In the bundled deployment it is `https://s3.` followed by the application domain.

### `S3_BUCKET`

Optional. Default: `chiban`. Text, at least 3 characters.

The bucket that holds stored documents, uploads and exports.

### `S3_ACCESS_KEY_ID`

Optional. Default: `chiban-dev`. Text.

The name of the object storage access key. Garage needs at least 8 characters.

### `S3_SECRET_ACCESS_KEY`

Optional. Default: `chiban-dev-secret`. Text.

The secret of the object storage access key.

### `S3_REGION`

Optional. Default: `us-east-1`. Text.

The region name sent with object storage requests.

### `S3_CORS_ORIGINS`

Optional. Default: empty. Comma-separated list.

Comma-separated origins allowed to upload straight to the bucket. When empty, the origin of `BASE_URL` is used. `pnpm storage:init` applies the rule.

### `GARAGE_ADMIN_ENDPOINT`

Optional. Default: `http://localhost:9011`. URL.

The Garage admin API address. Only the storage setup step uses it.

### `GARAGE_ADMIN_TOKEN`

Optional. Default: `chiban-dev-admin-token`. Text.

The Garage admin API token. Only the storage setup step uses it.

## Document preservation

### `GHOSTSCRIPT_PATH`

Optional. Default: `gs`. Text.

The Ghostscript command, used to make PDF/A copies and to apply redactions.

### `GHOSTSCRIPT_ICC_PROFILE`

Optional. No default. Text.

An ICC color profile for PDF/A copies. When unset, the sRGB profile that ships with Ghostscript is used.

### `OCRMYPDF_PATH`

Optional. Default: `ocrmypdf`. Text.

The OCRmyPDF command, used to make scanned files searchable.

### `VERAPDF_PATH`

Optional. Default: `verapdf`. Text.

The veraPDF command, used to check PDF/A copies. When it is missing, copies are kept and marked as not validated.

## Backups and exports

### `PG_DUMP_PATH`

Optional. Default: `pg_dump`. Text.

The `pg_dump` command used by backups and the recovery export.

### `PG_RESTORE_PATH`

Optional. Default: `pg_restore`. Text.

The `pg_restore` command used by the restore check and the anonymous intake verification.

### `BACKUP_PASSPHRASE`

Optional. No default. Text, at least 16 characters.

The passphrase backups are encrypted with. The backup and restore check scripts refuse to run without it.

### `EXPORT_WORK_DIR`

Optional. Default: `/tmp/chiban-export`. Text.

A scratch folder for building exports, importing archives and checking restores.

## Health alerts

### `ALERT_EMAIL_TO`

Optional. Default: empty. Comma-separated list.

Comma-separated email addresses that receive health alerts. When empty, no alert email is sent.

### `HEALTH_DISK_PATHS`

Optional. Default: `/`. Comma-separated list.

Comma-separated paths whose disk usage the health check watches. It warns at 80 percent full and raises a critical alert at 90 percent.

### `HEALTH_HEARTBEAT_URL`

Optional. No default. URL.

A URL the health check calls on every run, for an outside monitor that alerts when the calls stop.

### `PAGER_EVENTS_URL`

Optional. No default. URL.

The events address for pager alerts. When unset, the PagerDuty Events API v2 address is used.

### `PAGER_ROUTING_KEY`

Optional. No default. Text.

The routing key for pager alerts. Pager alerts are sent only when it is set.

- `PAGER_ROUTING_KEY` is required when PAGER_EVENTS_URL is set.

## Payments

### `ENABLE_SIMULATED_PAYMENTS`

Optional. Default: `false`. Accepts `true` or `false`.

Turns on the simulated payment processor, which backs the in-app checkout page and the counter card reader panel. Both say on screen that no live processor is connected.

- `ENABLE_SIMULATED_PAYMENTS` must be true when CHIBAN_DEMO_MODE is on, so the simulated checkout works.

### `STRIPE_API_BASE`

Optional. No default. URL.

Points the Stripe adapter at another address, such as a local `stripe-mock` on port 12111, for development.

- `STRIPE_API_BASE` must not be set in production.

## Address checks

### `USPS_CLIENT_ID`

Optional. No default. Text.

The Consumer Key of an app registered at developers.usps.com. With neither USPS credential set, address fields work as plain text and nothing is sent.

- `USPS_CLIENT_ID` is required when USPS_CLIENT_SECRET is set.

### `USPS_CLIENT_SECRET`

Optional. No default. Text.

The Consumer Secret of the same USPS app.

- `USPS_CLIENT_SECRET` is required when USPS_CLIENT_ID is set.

### `USPS_API_BASE`

Optional. Default: `https://apis.usps.com`. URL.

The USPS Addresses API address. Use `https://apis-tem.usps.com` for the USPS testing environment.

### `USPS_STUB`

Optional. Default: `false`. Accepts `true` or `false`.

Answers address checks from a local stand-in, so the suggestion can be tried without credentials.

- `USPS_STUB` must not be set in production.

## Demo and development

### `ENABLE_DEV_SIGN_IN`

Optional. Default: `false`. Accepts `true` or `false`.

Turns on `/dev/sign-in`, which signs in as any seeded demo user without a password. It works only outside production.

### `CHIBAN_DEMO_MODE`

Optional. Default: `false`. Accepts `true` or `false`.

Runs the installation as a public demo: the Try the demo page, the demo notice, simulated payments only, and refusal of changes that would affect every visitor. The reset to the fictional Town of Alder Pond is `pnpm demo:reset`, run on a schedule you set up.

### `CHIBAN_DEMO_RESET_AT`

Optional. No default. Text, up to 60 characters.

The reset time shown in the demo notice, as free text of up to 60 characters. It does not schedule the reset.

- `CHIBAN_DEMO_RESET_AT` is required when CHIBAN_DEMO_MODE is on.

### `CHIBAN_DEMO_MAIL_SINK_HOSTS`

Optional. Default: `mailpit`. Comma-separated list.

Comma-separated mail hosts a demo may send to, so demo mail never leaves the server.

### `CHIBAN_DEMO_OVERLAY_FILE`

Optional. No default. Text.

Path to a demo overlay file applied on every demo reset.

### `CHIBAN_TERMS_FILE`

Optional. No default. Text.

Path to a banned-terms file for the term gate, a repository check. The application does not read it.

---
title: Object storage
sidebar_label: Object storage
description: What Chiban keeps in its object store, how browsers upload and download without passing files through the application, and which storage settings the bundled Compose file passes.
sidebar_position: 40
---

# Object storage

This page is for whoever runs the server. [Self-hosting Chiban](./self-hosting.md) covers installing Garage, the object store in the bundled deployment, and rotating its access key. This page covers how the application uses it, so you can tell what a symptom means.

## What is stored

Files live in one bucket, named by `S3_BUCKET`. The database holds the records and the bucket holds the bytes: uploaded documents and photos, the copies Chiban makes from them, and the export archives. Keys begin with `uploads/tmp/` for files still arriving, `blobs/sha256/` for files the town keeps, named by their hash, and `exports/` for export archives. Backups are not kept in the bucket. See [backups](./backups.md).

Export archives expire. The worker's daily export cleanup removes a built export 7 days after it was made.

## Two addresses for one store

Chiban reaches the store by two names, and both must work.

| Setting | Bundled value | Used by |
| --- | --- | --- |
| `S3_ENDPOINT` | `http://garage:3900` | The application, the worker and the command-line tools, inside the Compose network |
| `S3_PUBLIC_ENDPOINT` | `https://s3.` followed by `APP_DOMAIN` | Browsers, through links Chiban signs |

Requests use path-style addressing, with the bucket in the path and not in the host name. That is why one `s3.` record is enough.

The Caddy block for `s3.APP_DOMAIN` forwards to Garage and adds `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` and a content security policy that forbids scripts and framing, so a stored file cannot run in the town's site. Garage's own ports are not published on the host. Only Caddy's ports 80 and 443 are.

## How uploads and downloads move

Uploads do not pass through the application. When someone adds a file, the application checks the size against `MAX_UPLOAD_BYTES` and signs a one-file upload address valid for 15 minutes. The signature covers the content type and length. The browser then sends the file straight to the `s3.` name. A file whose type or length differs from what was signed is refused by the store with a 403. When the browser reports the upload done, the application checks the stored object's size and type against what was declared, and files it under `blobs/sha256/`, with a key made from the file's SHA-256 hash. An intent not finished within the 15 minutes expires.

Downloads use two routes. A document that staff have approved for public release is streamed through the application, with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and a sandboxing content security policy. Every other document download is answered with a redirect to an address the application signs, valid for 60 seconds. An address used after that fails with status 400 and the message `Date is too old`.

A browser upload needs the bucket's cross-origin rule, which allows `GET`, `PUT` and `HEAD` from the town's origin. The `storageinit` step writes the rule on every deploy. `S3_CORS_ORIGINS` can list other origins. When it is empty, the origin of `BASE_URL` is used. If uploads fail in the browser console with a cross-origin error after a change to `BASE_URL`, run the next deploy or `docker compose run --rm storageinit`.

### Size limits

| Limit | Value | Where it applies |
| --- | --- | --- |
| `MAX_UPLOAD_BYTES` | 104857600 (100 MiB) by default | A document or photo upload, checked when the upload address is signed |
| Caddy `request_body` | 80 MB | Requests to the application's own name. It does not apply to uploads to the `s3.` name. |
| Form bodies | 64 MB | The application's limit on a submitted form with files |
| Complaint photos | 60 MB in total | The public complaint form, which sends photos through the application |

## What storage setup does

The `storageinit` service runs `dist/storage-init.mjs` before the migration step, so the app does not start until it has succeeded. It uses Garage's administration interface, which listens on port 3903 inside the Compose network, to create the bucket if it is missing, to give the access key read, write and owner rights on it, and then it sets the cross-origin rule through the S3 interface. It prints `bucket <name> ready at <endpoint> for <origins>` when done and `storage init failed at <operation> (<status>): <message>` when not.

Everything else in the application speaks plain S3. Only this step is specific to Garage. Anyone who points `S3_ENDPOINT` at a different S3 service has to create the bucket, the key and the cross-origin rule by hand and skip this step. This repository tests only Garage.

## Settings and the bundled Compose file

| Setting | Passed to the services by `deploy/docker-compose.yml` |
| --- | --- |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Yes, to the application, worker, migration step and storage setup |
| `GARAGE_ADMIN_ENDPOINT`, `GARAGE_ADMIN_TOKEN` | To the storage setup step only |
| `S3_REGION` | No. The default, `us-east-1`, matches the region in `deploy/garage.toml`. |
| `S3_CORS_ORIGINS` | No. The origin of `BASE_URL` is always used. |
| `MAX_UPLOAD_BYTES` | No. The 100 MiB default applies. |

To change one of the last three, add it to the shared environment block at the top of the Compose file. The [configuration reference](../reference/configuration.md) lists every storage setting.

## Watching the disk

The worker's health check reads the disk that holds the object store. The bundled Compose file mounts the PostgreSQL and Garage volumes read-only into the worker at `/monitor/pg` and `/monitor/garage` and sets `HEALTH_DISK_PATHS` to those two paths. A volume more than 80 percent full raises a warning alert and more than 90 percent a critical one. See [health, version and alerts](./health-and-alerts.md).

---
title: Background jobs and the worker
sidebar_label: Background jobs
description: What the worker process runs, on what schedule, how a job is claimed and retried, and how to tell that it is working.
sidebar_position: 80
---

# Background jobs and the worker

This page is for whoever runs the server. Much of what staff see as "it will happen shortly" is done by a separate process, the worker. If it is not running, the web application still answers, but queued mail does not go out, exports do not start, deadlines are not marked overdue and payments are not reconciled.

## The worker

The `worker` service in `deploy/docker-compose.yml` runs the same image as the application with the command `node dist/worker.mjs`. In a development checkout, `pnpm worker` does the same. It is not optional and there is only one, defined in the Compose file with `restart: unless-stopped`.

On start it connects to PostgreSQL with pg-boss, a job queue that keeps its tables in the same database as the town's data, records the start time, registers every job and prints `worker (pg-boss) started`. On a stop signal it finishes the jobs in hand and exits.

Two things matter about how work reaches it. The web application opens no connection to the job queue, because only the worker does, so it cannot call the worker. A staff action that needs background work writes a row to the database, such as a queued notification, a requested export or a preservation record. The worker's scheduled jobs find those rows. Several jobs run every minute for that reason. And a sweep job, every 5 minutes, re-queues rows that have waited too long, so a job lost in a crash is picked up again.

## How a job runs

Each job has a name and a deduplication key. When a job starts, it claims its key in the `job_effects` table in the same transaction as its work, and a second job with the same key does nothing. A job that fails does not keep its key, so it can be tried again. Each item gets 10 minutes before it is cancelled. A failure is recorded in `job_runs` with the time and the error text, and a success records its time. Those two timestamps are what the Health page and the stale-job alert read.

Queues use the exclusive policy: one job of a name at a time.

## The jobs

Intervals are those in the code. Jobs with no interval run when something enqueues them.

| Job name | Health page label | Runs | What it does |
| --- | --- | --- | --- |
| `system.heartbeat` | System heartbeat | Every 5 minutes | Does nothing. Its last success shows the worker is alive. |
| `health.check` | Health check | Every 5 minutes | Evaluates disk and job health and sends alerts. See [health and alerts](./health-and-alerts.md). |
| `jobs.sweep` | Stuck job sweep | Every 5 minutes | Re-queues work that has waited too long: a missed daily check, notifications, calendar updates, preservation, exports, redactions, disposition batches, file deletions and public copies. |
| `notifications.send` | Notification sending | Every minute | Sends queued notices by email. See [outbound mail](./outbound-mail.md). |
| `records.preserve` | Records preservation | Every minute | Makes the long-term PDF/A copies of stored documents and validates them. |
| `exports.pickup` | Export pickup | Every minute | Starts queued exports and a monthly copy someone asked to run now. |
| `payments.reconcile` | Payment reconciliation | Every hour | Checks open payments with the processor. See [payments](./payments.md). |
| `reports.scheduled` | Scheduled reports | Every hour | Emails reports that are due. |
| `gis.scheduleRefreshes` | Parcel layer refresh scheduling | Every hour | Starts a parcel layer refresh when one is due. |
| `clocks.daily` | Daily clock check | Every day | Marks deadlines overdue, sends the due-soon and overdue notices, and expires permits not used by their exercise-by date. |
| `appeals.daily` | Daily appeal period check | Every day | Records that an appeal period has ended. |
| `parcels.expireAliasOverrides` | Parcel ID override expiry | Every day | Expires parcel ID overrides that have run out. |
| `exports.prune` | Export cleanup | Every day | Removes built exports older than 7 days. |
| `exports.incremental` | Incremental export | Every day | Runs the monthly copies whose day has come. See [monthly export](../reports-and-export/incremental-export.md). |
| `gis.refreshLayer` | Parcel layer refresh | When its scheduler finds a layer due | Refreshes one parcel layer from its source. |
| `calendar.push` | Calendar updates | When an inspection changes | Sends calendar invitations. See [Microsoft 365](./microsoft.md). |
| `exports.build` | Export build | When an export is requested | Builds one export archive. |
| `redaction.run` | Redaction run | When a redaction is started | Builds the redacted copy of a document. |
| `renditions.derive` | Renditions derive | When staff approve a document version for the public site | Builds its thumbnail. |
| `records.dispose` | Records dispose | When a disposition batch is approved | Disposes of the records in the batch. |
| `files.release`, `files.delete` | Files release, Files delete | After disposition | Removes stored files that nothing refers to any more. |

A daily job is registered with the cron expression `0 */24 * * *`. The code sets no time zone, and pg-boss then uses UTC, so a daily job fires at 00:00 UTC. An hourly job fires at the top of the hour and a five-minute job on the five-minute marks. The Health page shows the actual times in the town's time zone.

## Telling whether it works

- **Settings**, **Administration**, **Health** shows when the worker last started and each job's last success. A job marked **Overdue** has not succeeded for twice its interval.
- `/api/health/jobs` answers 503 while a job alert is firing.
- `docker compose ps` shows whether the `worker` container is up, and `docker compose logs worker` shows its output.
- Alerts reach someone only if the alert settings are in place. See [health and alerts](./health-and-alerts.md), which lists settings the bundled Compose file does not pass.

## What the worker needs inside the image

The image's runtime stage installs Ghostscript and the PostgreSQL 16 client tools. Ghostscript makes the PDF/A copies and applies redactions. The same stage does not install OCRmyPDF or veraPDF, which the settings `OCRMYPDF_PATH` and `VERAPDF_PATH` point to. A separate `migrate-tools` build target adds OCRmyPDF and Tesseract for the legacy-document tool. Without veraPDF the worker still keeps its PDF/A copies and marks them as not validated, as the [configuration reference](../reference/configuration.md) says for `VERAPDF_PATH`.

## Settings

`deploy/docker-compose.yml` passes the same environment block to the application, the worker, the migration step and the storage setup, plus `HEALTH_DISK_PATHS` and two read-only volume mounts to the worker alone. The worker needs the database, the object store, SMTP and the secret keys, and it stops at start if any setting is invalid, as the application does.

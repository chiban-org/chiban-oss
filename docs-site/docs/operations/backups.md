---
title: Backups and restoring the database
sidebar_label: Backups and restore
description: Exactly what a Chiban backup holds, the commands that make and check one, how a restore works, and what Chiban does not do for you.
sidebar_position: 50
---

# Backups and restoring the database

This page is for whoever runs the server. [Self-hosting Chiban](./self-hosting.md) gives the schedule to put in cron and the restore steps in order. This page says exactly what exists.

## What a backup is

One encrypted file holds everything needed to rebuild a town's installation. The file is a tar archive, encrypted as a stream with AES-256-GCM, using a key that scrypt derives from `BACKUP_PASSPHRASE`. Inside it:

| Entry | Content |
| --- | --- |
| `database.dump` | The whole database, written by `pg_dump` in its custom format, without owners or privileges. It includes the job queue tables, because they live in the same database. |
| `secrets.json` | The values of `CHIBAN_SECRET_KEYS` and `CHIBAN_ACTIVE_KEY_ID`, which the application needs to read saved credentials. |
| `objects/` | Every file in the object store except those under `exports/`. Exports are downloads that can be built again. |
| `backup-manifest.json` | The application version, the migration head, the creation time, the SHA-256 of the dump, and the key, size and SHA-256 of every object. |

Every backup is complete. There are no incremental backups and no continuous archiving of the database, so you can restore to the moment of a backup and no later.

The passphrase must be at least 16 characters. Nobody can open a backup without it, you included. Keep it, and a copy of `CHIBAN_SECRET_KEYS`, outside the backups.

## Making a backup

From the `deploy` directory:

```
./backup.sh
```

The script reads `BACKUP_PASSPHRASE` from the environment or from `.env`, then runs `node dist/backup.mjs --dir /srv/target` in a one-off application container with the `backups` folder mounted. It prints the file it wrote, for example `backups/chiban-backup-2026-11-11.bin`, and the tool prints the number of objects and bytes. The name carries the town's date, in the town's time zone.

Before it dumps anything the tool checks that every file the database points to can be read from the object store. If any is missing it stops and writes nothing:

```
backup failed: {"missingObjects":["blobs/sha256/..."]}
```

The other failures are `passphrase_too_short`, `dump_failed` (the `pg_dump` run failed) and `object_unreadable`. Each exits with status 1. A run is cut off after 6 hours.

The tool works in `EXPORT_WORK_DIR` inside the container, `/tmp/chiban-export` by default, where it holds the dump and then the encrypted file before it copies the result out. Make sure that location has room for both.

### Sending a backup to an export target

Instead of the local folder, a backup can go to an export target set up under **Settings**, **Data export**, **Copy exports to your own storage every month**, whatever its kind. The file lands at `backups/chiban-backup-<date>.bin` inside the target.

```
docker compose run --rm --no-deps -e BACKUP_PASSPHRASE app node dist/backup.mjs --target "Target name"
```

The `-e BACKUP_PASSPHRASE` copies the variable from your shell, so export it first. It is needed because the bundled Compose file does not pass that setting to the application. `backup.sh` passes it the same way.

## Checking a backup

`./restore-verify.sh [--keep] [backup-file]` checks the newest file in `backups` unless you name one. It runs `node dist/restore-verify.mjs` in a one-off container and works in four steps.

1. Decrypts the file and unpacks it, putting every object into a temporary bucket named after `S3_BUCKET` with `-restore-check-` and a random suffix, and checks every object and the dump against the manifest.
2. Creates a temporary database named `chiban_restore_check_` plus a random suffix on the same PostgreSQL server and restores the dump into it with `pg_restore`. The database account therefore needs the right to create databases. The bundled account does.
3. Compares every table with the live database, and reads every stored file back from the temporary bucket to check its hash.
4. Drops the temporary database and bucket, unless you passed `--keep`.

It prints a JSON report and exits 0 only when the report's `ok` is true. The fields to read are `dumpOk`, `objectsChecked`, `filesRehashed`, `filesMismatched` and `differences`. A wrong passphrase or a damaged file ends with `verification failed: wrong_passphrase_or_damaged`.

The comparison is with the database as it is now, so rows changed since the backup show up as differences. Run the check straight after a backup. `./backup.sh --verify` does both.

## Restoring

Restoring is manual. No single command does it and no screen starts one. [Restoring for real](./self-hosting.md#restoring-for-real) lists them: decrypt the file with `node dist/chiban-recover.mjs decrypt`, which asks for the passphrase at the terminal and so needs an interactive session, unpack the tar, load `database.dump` with `pg_restore`, create the bucket with `storageinit`, and copy the unpacked `objects/` back with `node dist/restore-objects.mjs --dir`.

Three points about a restore:

- The restore is only as new as the backup. Work done since is gone.
- `restore-objects` refuses to run when the bucket does not exist, and tells you to run the storage setup step first.
- When you start the stack afterward with `docker compose up -d`, the migration step runs first and applies any migrations newer than the dump, which brings the database up to the schema of the image you start. See [upgrading and migrations](./upgrading.md).

## What Chiban does not do

- It does not schedule backups. Run `backup.sh` from cron.
- It does not delete old backups. Keep several nights, copy them off the host, and prune them yourself.
- It has no page that lists, takes or restores backups.
- It does not alert when a backup has not been made. The [health check](./health-and-alerts.md) watches jobs and disk space, not the `backups` folder.
- `BACKUP_PASSPHRASE` is not passed to any service by the bundled Compose file. Only the scripts and the command above pass it.
- The `pg_dump` and `pg_restore` programs in the application image are PostgreSQL 16 clients, so the database server must stay at version 16.

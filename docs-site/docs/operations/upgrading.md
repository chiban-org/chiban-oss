---
title: Upgrading and migrations
sidebar_label: Upgrading
description: What an upgrade changes, how database migrations run during a deploy, what a rollback does and does not undo, and the checks to make afterward.
sidebar_position: 60
---

# Upgrading and migrations

This page is for whoever runs the server. [Self-hosting Chiban](./self-hosting.md) shows the deploy command and what the script does step by step. This page covers what happens to the database, which a rollback does not undo.

## What an upgrade is

An upgrade is a new application image, named by its digest, put on the same host with the same settings:

```
./deploy.sh --image registry.example.org/chiban@sha256:<digest>
```

One image serves the web application, the worker, the migration step and the command-line tools, so all of them change together. Settings, the database and the object store stay as they are. Nothing in the town's data is rewritten except by the migrations in the new image.

## Before you start

1. Take a backup and check it: `./backup.sh --verify`. See [backups](./backups.md). The rollback described below does not reverse database changes, so the backup is what you return to if a migration goes wrong.
2. Note where you are. The version endpoint tells you:

   ```
   curl https://town.example.org/api/version
   ```

   The answer carries `imageRef`, the digest of the running image, `migrationHead`, the name of the newest migration applied, and `pack`, the state pack's id, version and hash. It also carries `appVersion`, but that is the version in `package.json`, which is `0.0.0`, so use `imageRef` to tell releases apart. The deploy script's `releases.log` also lists every image the host has run.

## How migrations run

A migration is an SQL file in the `drizzle` folder of the image, numbered in order, such as `0105_nh_parcel_id_formats.sql`. A developer makes one with `pnpm db:generate`, which compares the schema in `src/db/schema` with the last snapshot, and commits the file with the code that needs it. The file `drizzle/meta/_journal.json` lists them in order. The database records which have run.

During a deploy the `migrate` service runs `node dist/migrate.mjs` once and exits. It does two things.

1. Makes sure the four PostgreSQL extensions Chiban needs exist, with `CREATE EXTENSION IF NOT EXISTS`: `postgis`, `pgcrypto`, `citext` and `pg_trgm`. The database user needs the right to do that. The bundled one has it.
2. Applies every migration that has not run yet, oldest first.

It prints `migrations applied` and exits 0, or prints `migration failed: <reason>` and exits 1. It gives up after 120 seconds, a limit fixed in the code, so a migration that rewrites a very large table would need that raised in the source.

The application and the worker are set to start only after `migrate` has exited successfully, and `migrate` itself waits for the storage setup step. So the new application never runs against a schema that is behind it. If `migrate` fails, the deploy script treats the rollout as failed and rolls back. Read why with:

```
docker compose logs migrate
```

Running the same image again is harmless: with nothing to apply, the step reports success and changes nothing.

## What a rollback undoes

When a rollout fails, `deploy.sh` writes the previous image back as `CHIBAN_IMAGE`, restarts the application and worker on it and records `rolled_back` in `releases.log`. That is all it does. Chiban has no down migrations, and the script does not touch the database. A migration that succeeded before the failure stays applied, and the previous image then runs against the newer schema.

If that is not acceptable, restore the pre-upgrade backup as described in [backups](./backups.md).

On a first deploy there is no previous image, and the script records `failed_no_previous`.

## After the upgrade

- Compare `/api/version` with what you noted. `imageRef` should be the new digest and `migrationHead` should have moved if the release has migrations.
- Run `./verify-anonymous-intake.sh --backup-dir /path/to/backups` if the town uses anonymous complaints. A new image closes that route until it has passed, as [self-hosting](./self-hosting.md) explains.
- Look at **Settings**, **Administration**, **Health** for firing alerts and for jobs marked overdue. A worker that did not come back shows up there first.

### Changes to state law rules

The pack carries the state's rules, each with a version number. Each clock records the rule version and the pack version it started under. When a release declares a transition for a rule whose length changed, running clocks stay as they are until someone runs:

```
docker compose run --rm --no-deps app node dist/rules-migrate.mjs --preview
docker compose run --rm --no-deps app node dist/rules-migrate.mjs --apply
```

The preview lists, for each declared transition, how many running clocks it affects and their old and new due dates. Applying it records the transition once, so a second run reports it as already applied, and writes an audit entry. A transition has one of two policies. With `keep_old`, running clocks stay as they are, and any follow-up tasks the transition declares are added to the affected applications. With `switch`, each running clock is replaced by a new one under the new rule version, the old one is marked superseded, and an application whose old clock had been adjusted gets a task to review the adjustment. The New Hampshire pack declares none today, and both commands then print `No rule transitions are declared.` Run the preview after an upgrade that changes `pack.version` in `/api/version`.

### Starters

Adopted starters do not change when the application does. An administrator reviews updates with **Check adopted starters for updates** at the foot of **Starter templates** and accepts the ones the town wants. See [the starter catalog](../state-packs/new-hampshire/starters.mdx).

## Development checkouts

In a checkout, `pnpm db:migrate` runs the same migrator against the database named in `.env`. There is no command to step back.

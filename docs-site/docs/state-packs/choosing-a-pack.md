---
title: Choosing a state pack
sidebar_label: Choosing a state pack
description: Which state packs Chiban ships, how to pick one for an installation, when to pick it, and how to check which one is running.
sidebar_position: 1
---

# Choosing a state pack

This page is for whoever installs and runs the server. A state pack holds one state's law as Chiban uses it: the deadlines and how days are counted, the legal holidays, the board names, the permit types a town can adopt, the records retention schedule, the public records rules and the statutes each of them cites. An installation runs one pack, and the town on it works under that state's rules.

## The packs Chiban ships

| Id | State | Staff pages |
| --- | --- | --- |
| `nh` | New Hampshire | [Deadlines and holidays](./new-hampshire/deadlines.mdx), [Starter catalog](./new-hampshire/starters.mdx) |
| `me` | Maine | [Deadlines and holidays](./maine/deadlines.mdx), [Starter catalog](./maine/starters.mdx) |

The staff pages list every deadline, holiday and starter the pack provides. Read them with the town's land use staff before you decide.

A state that is not in the table needs a pack written for it before Chiban can serve a town there. [Writing a state pack](./writing-a-pack.md) explains how.

## How to choose

Set `CHIBAN_PACK` to the pack's id in the `.env` file next to the Compose file:

```
CHIBAN_PACK=me
```

The bundled `deploy/docker-compose.yml` passes the setting to the application, the worker and the migration step. A blank or missing value means `nh`. The setting is read each time a process starts, not when the image is built, so the same image serves either state. An id that no pack has stops the first request that needs the pack. The [configuration reference](../reference/configuration.md#chiban_pack) has the exact format.

## When to choose

Choose the pack before the first migration, and before the town enters its first record.

When migrations finish, the migration step installs the pack's parcel ID formats if none of them is in the database yet. New Hampshire's are a 15-digit CAMA number and a 12-digit map-lot ID. Maine's is a single free-text "Map and lot" format. A town can edit its formats afterwards under **Settings**, **Parcel ID formats**.

Clocks and filed documents are stored with the rule and record series keys of the pack they were made under, and Chiban has no tool that converts a town's records from one pack to another. Treat the choice as permanent for an installation that holds real records.

## What changes with the Maine pack

Most of what changes is wording and law, which the staff pages cover. A few differences affect setup:

- The **Plumbing inspector** staff role appears. It owns the internal plumbing, subsurface wastewater and seasonal dwelling conversion permits. Under New Hampshire the role is hidden.
- Board names follow Maine law, so the town has a Board of Appeals in place of a Zoning Board of Adjustment.
- No building code applies until the town picks one in its building program under **Settings**. A town over 4,000 residents can publish only the Maine Uniform Building and Energy Code.
- Abutters are the owners of the parcels that touch the application's parcels. A board may also take in every parcel within a set distance of the application's parcels, up to 1,000 feet, a limit Chiban sets. Street and stream projection is not offered.
- Records requests are FOAA requests, and staff can record an acknowledgement as the first response.
- Abutter distances are measured in NAD83 / Maine East (ftUS), EPSG 26847.

## Check which pack is running

`/api/version` answers with `pack`, the pack's id, version and hash, as described in [upgrading](../operations/upgrading.md). In the application, **Settings**, **State law** shows a line such as "Jurisdiction pack me version 0.9.0, fingerprint" followed by the first 12 characters of the hash.

## The demo

The demo reset seeds the fictional town that belongs to the active pack. Under `nh` that is the Town of Alder Pond. Under `me` it is the Town of Fernhollow, and the overlay file described in [dressing a demo as another town](../operations/demo-overlay.mdx) is not applied. [Demo mode](../operations/demo-mode.md) covers the rest.

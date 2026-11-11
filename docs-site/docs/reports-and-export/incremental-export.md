---
title: Monthly export to storage the town controls
sidebar_label: Monthly export to town storage
description: Have Chiban copy the town's records every month to a folder, bucket or drive the town owns.
---

# Monthly export to storage the town controls

Chiban can copy the town's records every month to storage the town owns: a folder on the server, an S3 bucket, or a OneDrive or SharePoint drive. The town then holds its own copy of everything, outside Chiban, without anyone having to remember to download it.

The first copy holds everything. After that, each month's copy holds only what changed since the one before.

An administrator sets this up. Go to **Settings**, **Data export**, and choose **Copy exports to your own storage every month**. That opens the **Export storage** page.

## Adding a place to copy to

Each place is called a target. Give it a name, a day of the month from 1 to 28, and one of three kinds:

- **Folder on the server:** the full path of a folder the Chiban service can write to. Chiban writes each file under a temporary name and renames it when it is complete, and it refuses any path that leads outside the folder.
- **An S3 bucket:** the storage address, bucket, an optional folder, the region and an access key. Any S3-compatible storage works.
- **OneDrive or SharePoint:** the Microsoft 365 tenant, the app registration, the drive and the client secret. The app needs the application permission `Files.ReadWrite.All`, or `Sites.Selected` for a single SharePoint site. This kind has not been connected to a live Microsoft 365 tenant yet. It has only been tested against a local stand-in.

Saved keys and secrets are stored encrypted and are never part of an export.

## When the copies run

A target copies on its day of the month. If Chiban was down that day, the copy runs at the next daily check. **Run now** starts a copy within a minute or two. **Turn off** stops a target's monthly copies until you turn it on again.

## What lands in the target

```
chiban-export/
  exports.json
  files/sha256/{aa}/{bb}/{sha256}
  2026-11/
    manifest.json
    manifest.sha256
    FORMAT.md
    data/{entity}.ndjson
  2026-12/
    ...
```

- `files/` holds every stored document, shared by all the months. Each file is written once.
- Each month has its own folder, holding only the kinds of records that changed since the previous copy. A second copy in the same month goes to `2026-11-2`, then `2026-11-3`.
- `manifest.json`, `manifest.sha256` and `FORMAT.md` are written after every data file and document, and `exports.json` after them. A month folder without `manifest.json` is a copy that did not finish, and nothing uses it.
- `exports.json` is the index that says which folder each copy is in. Each kind of record in a month's manifest says which copy last wrote it, and the index turns that into a folder.

`FORMAT.md` describes every file. It is the same text as the [export archive format](./export-format.md) page.

## Rebuilding the town from the copies

A month's manifest, together with the folders it points to, holds the whole town. The copies are made so that an empty Chiban on the same version can be rebuilt from them alone, with every file checked against its hash. This release has no command or page that runs that rebuild. To restore a town today, use the encrypted backups described in [self-hosting](../operations/self-hosting.md).

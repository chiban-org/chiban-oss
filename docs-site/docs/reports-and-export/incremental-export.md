# Monthly export to storage the town controls

An administrator can point Chiban at storage the town owns. Each month Chiban copies only what
changed since the last copy. The first copy holds everything.

## Targets

Add targets at `/staff/admin/export/targets`. Each target has a name, a day of the month (1 to 28)
and one of three kinds.

- Folder on the server: a full path. Chiban writes each file under a temporary name and renames it
  when complete, and refuses any path that leaves the folder.
- S3 bucket: endpoint, bucket, optional folder, region, access key. Works with any S3 compatible
  storage.
- OneDrive or SharePoint drive: tenant, app registration, drive and client secret. The app needs
  the application permission `Files.ReadWrite.All`, or `Sites.Selected` for a single SharePoint
  site. This kind is not connected to a live Microsoft 365 tenant. It has only been tested against
  a local stand-in.

Credentials are stored encrypted and are not part of exports. A target copies on its day of the
month, or on the next daily check after that day if the instance was down. "Run now" copies within
a minute or two. Turning a target off stops its copies.

## Layout

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

- `files/` is shared by every month. A file is written once.
- A month folder holds only the entities that changed since the previous copy. A second copy in
  the same month goes to `2026-11-2`, then `2026-11-3`.
- `manifest.json`, `manifest.sha256` and `FORMAT.md` are written after every data file and stored
  file, and `exports.json` after them. A folder without `manifest.json` is an unfinished copy and
  is not used.
- `exports.json` maps each export id to its folder. Each entity in a manifest says which export
  wrote it in `inExport`, and the index turns that into a folder.

## Restore

A month's manifest plus the folders its `inExport` values point to rebuild the whole town. Restore
into an empty Chiban instance on the same migration version, using only the target's contents:
`importFromTarget` reads `chiban-export/{folder}/manifest.json`, resolves every entity and file
through `exports.json`, verifies every hash, and imports in one transaction.

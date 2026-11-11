---
title: Bringing in scanned property files
sidebar_label: Scanned property files
description: Load folders of scanned records so each file lands on the right parcel, searchable, and stays private until staff show it on the public site.
sidebar_position: 4
---

# Bringing in scanned property files

Many towns keep old property files on paper or in folders of scans: septic approvals, plot plans, old deeds. Chiban can load a whole folder of them so each file lands on the parcel it belongs to. Every file is kept as it was, and a searchable PDF/A copy is stored beside it so the text can be found.

Nothing loaded this way is public. Staff look the batch over first, then show it on the public site in one step.

This is a two-person job. An operator, whoever runs the server, scans and runs the folder with a command. Staff then review the result on the **Scanned property files** page, under **Settings**, then **Administration**. You need both the permission to manage documents and the permission to manage parcels to see the page, which administrators and land use staff have. Showing a batch publicly needs the permission to publish documents.

## Preparing the folder

The parcel for each file comes from the name of the folder it sits in. Put every file in a folder whose name carries the parcel's map and lot, for example one folder per lot named `007-014`. The operator gives the command a pattern that reads those numbers out of the folder name. Chiban builds the parcel's 15-digit CAMA number from them, using the same layout as the [assessing file import](./cama-import.md): the map, lot, sublot and unit are padded with zeros, and a part the folder name does not carry counts as zeros. Folder `007-014` becomes `007014000000000`.

Files can be PDFs or images. Hidden files and system leftovers such as `Thumbs.db` are skipped.

## The three steps

The operator runs three commands, each as a named staff member who has the permissions above.

1. **Scan.** Lists every file in the folder and records it in a new batch with a name you choose, and the record series it belongs to. A record series is the retention class the files are kept under. Nothing is copied yet.
2. **Run.** Copies each file in, makes the searchable PDF/A copy and links it to its parcel.
3. **Report.** Prints the batch's results.

```
node dist/legacy-docs.mjs scan --as clerk@town.example --root /scans/septic --name "Septic files" --series nh.rs.septic_plans --pattern "(?<map>\d{3})-(?<lot>\d{3})" --id-format cama15
node dist/legacy-docs.mjs run --as clerk@town.example --batch BATCH_ID
node dist/legacy-docs.mjs report --as clerk@town.example --batch BATCH_ID
```

The pattern is a regular expression with named parts. The names are the ID parts of the saved CAMA layout, which are `map`, `lot`, `sub` and `unit` in the default one. A folder whose name does not fit the pattern, or has a part that is not digits or is too long, is set aside rather than guessed at. `--id-format` is the key of the parcel ID format the number is looked up in, `cama15` for a 15-digit CAMA number.

## Reviewing a batch

**Scanned property files** lists each batch with its name, its status and when it was scanned. The statuses are **Scanned, not run yet**, **Running**, **Ready for review** and **Shown on the public site**.

Open a batch for the run report.

- **Source files**, **Imported**, **Duplicates linked** (a copy of a file already loaded, linked to the same document rather than stored twice), **Set aside**, **Skipped**, **Text recognition failed** and **Parcel not found**.
- **Set aside, by reason** names why files were set aside: the folder name did not match the pattern, the file type is not supported, or the file could not be read or changed after the scan.
- **Files that need a look** lists each affected file by its path, with the problem. "Text recognition failed, the original is kept" means the file is stored but not searchable, for example because the PDF is password protected. "Parcel not found, the file stays private" means no parcel has that ID. Those files wait on [unresolved records](./unresolved-records.md).

## Showing a batch on the public site

When a batch is **Ready for review** and you have permission to publish, choose **Show this batch on the public site**. Each file whose parcel was found then appears on that parcel's public page, where anyone can download it. Files whose parcel was not found stay private. Staff without that permission see a note asking them to hand the batch to someone who has it.

Review first, because once a file is public, anyone who finds the parcel can read it.

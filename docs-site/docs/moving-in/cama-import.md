---
title: Loading owners from the assessing file
sidebar_label: Owners from the assessing file
description: Fill in parcel owners, mailing addresses and site addresses from the assessing office's CAMA export.
---

# Loading owners from the assessing file

The assessing office keeps the town's owner names and mailing addresses in its CAMA system. Chiban reads them from a file that system exports, so that parcels show the right owner and abutter lists go to the right mailing address. Load a new file each time the assessing office gives you one.

You need the permission to run imports, which administrators and land use staff have. The work happens on the **Imports** page, in the CAMA section.

## What a file update does

A parcel with no owner name or mailing address gets the one in the file. When the file names a different owner or mailing address from the one Chiban has, the parcel is left alone: the row waits under **Exceptions** as an owner change until someone accepts it. A changed site address is applied straight away and kept in the audit log. A blank column never erases what Chiban already has.

The import never creates a parcel. A row whose parcel ID matches no parcel goes to **Exceptions** as an unknown CAMA parcel, and so does a row for a retired parcel. When the file lists every parcel, Chiban also reports the parcels that have a CAMA number but are missing from the file.

Loading the same file a second time changes nothing.

Once a CAMA layout is saved, owner names and mailing addresses come only from the CAMA file, and the parcels layer can no longer fill them in.

The **Imports** page shows when the CAMA file was last loaded, and marks it as out of date once more days have passed than the layer's setting allows.

## Loading a file

1. On the **Imports** page, go to the CAMA section and choose the file under **Column mapping**.
2. Pick the encoding and the delimiter (comma, tab or pipe). If you are not sure of the encoding, leave it on **Detect**. Choose **Read the file and preview**.
3. Match the columns. The pickers list the columns found in the file. For the parcel ID, add its parts in order: each part is a column with a width, or fixed digits. For owner name, mailing address and site address, pick one or more columns, and set what goes between two owner names.
4. Check the preview. It shows the first 10 rows with the parcel ID each one builds and whether that ID matches a parcel, matches a retired parcel, matches no parcel, or could not be built. Change the pickers and preview again until the IDs match.
5. Choose **Save mapping** to keep the layout for next time, then **Run import**.

After the first time, the saved layout is used again, so a new file from the same system needs only steps 1, 2 and 5.

## The default layout

Chiban starts with its own layout, the Chiban CAMA CSV v1. If your file uses other columns, match them with the pickers before you run an import. The Avitar export layout has not yet been checked against a real Avitar file.

The default layout is a comma-separated file with a header row and these columns, in this order:

| Column | Meaning |
| --- | --- |
| `map` | Map number |
| `lot` | Lot number |
| `sub` | Sublot number |
| `unit` | Unit number. `000` for a parcel that is not a condominium unit |
| `owner_1` | First owner |
| `owner_2` | Second owner. May be blank |
| `mail_street_1` | Mailing street line 1 |
| `mail_street_2` | Mailing street line 2. May be blank |
| `mail_city` | Mailing city |
| `mail_state` | Mailing state |
| `mail_zip` | Mailing ZIP code |
| `site_number` | Street number of the parcel |
| `site_street` | Street name of the parcel |

The file may be UTF-8 or Windows-1252.

### How the parcel ID is built

The 15-digit CAMA number is built from the row: the map padded to 3 digits, the lot padded to 3, the sublot padded to 3, the fixed digits `000`, and the unit padded to 3. Map 7, lot 14, sublot 0 and unit 0 become `007014000000000`. Parts are padded with zeros on the left.

A part with more digits than its width, or with anything other than digits in it, is never cut short. The row gets no ID and goes to **Exceptions** as an ID format mismatch.

Each condominium unit has its own CAMA number, and all the units of a condominium point to the condominium's one parcel.

### How names and addresses are built

The two owner columns are joined with ` & `, and a blank one is left out. The mailing address joins the mailing columns that are not blank, with a space between them. The site address joins the street number and the street name. When every column for a field is blank, the field counts as missing, not as empty.

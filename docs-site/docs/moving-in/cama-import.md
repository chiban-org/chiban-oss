# CAMA owner import

Chiban fills each parcel's owner name, mailing address, and site address from a periodic CAMA
file. The file is a delimited text file with one row per assessing record. Open it from
Imports, then CAMA.

The Avitar export layout has not been checked against a real Avitar file. The default layout
below is the Chiban one. If your file uses other columns, match them with the column pickers
before you run an import.

## Chiban CAMA CSV v1

A comma separated file with a header row and these columns, in this order:

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

The file may be UTF-8 or Windows-1252. The default setting detects which.

### How the parcel ID is built

The 15 digit CAMA number is composed from the row: `map` padded to 3 digits, `lot` padded to 3,
`sub` padded to 3, the fixed digits `000`, and `unit` padded to 3. A row with `7`, `14`, `0`,
`0` in those columns becomes `007014000000000`. Parts are padded with zeros on the left. A part
that has more digits than its width, or is not made of digits, leaves the row without an ID and
the row goes to the exception queue as an ID format mismatch. Nothing is truncated.

Condominium units have one CAMA number each. All the units of a condominium resolve to the
condominium's one parcel.

### How names and addresses are built

Owner names from `owner_1` and `owner_2` are joined with ` & `. A blank column is left out. The
mailing address joins the non-blank mailing columns with a space. The site address joins
`site_number` and `site_street`. A field with no non-blank column is treated as missing, never
as an empty value.

## The mapping screen

1. Choose the file. Pick the encoding and the delimiter (comma, tab, or pipe). Choose Read the
   file and preview.
2. The pickers list the columns found in the file. For the parcel ID, add the parts in order.
   Each part is a column with a width, or fixed digits. For owner name, mailing address, and
   site address, pick one or more columns. Set the joiner placed between owner names.
3. The preview shows the first 10 rows with the composed ID and whether it matches a parcel, an
   unknown parcel, a retired parcel, or cannot be composed. Change the pickers and preview
   again until the IDs match.
4. Save mapping stores the layout. Run import applies the file.

Saving the mapping and running the import both need the permission to run imports.

## What an import does

- It never creates a parcel. A row whose ID matches no parcel goes to the exception queue as
  unknown CAMA parcel.
- A row whose ID belongs to a retired parcel goes to the exception queue.
- A missing owner or mailing address on a parcel is filled in.
- An owner or mailing address that differs from the one already stored is held in the exception
  queue as an owner change. The parcel is not changed until someone accepts the held row.
- A blank value in the file never replaces a stored value.
- A changed site address is applied and recorded in the audit log.
- If the file lists every parcel, parcels that have a CAMA number but are absent from the file
  are reported as missing from the layer.
- Running the same file twice changes nothing the second time.

Once a CAMA layout is saved, the parcels layer mapping cannot also map an owner name or a
mailing address. Owner data has one source.

The Imports page shows when the CAMA layer last imported and marks it stale after the number of
days set for the layer.

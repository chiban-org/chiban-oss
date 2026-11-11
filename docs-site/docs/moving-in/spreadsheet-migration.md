---
title: Loading an old permit ledger
sidebar_label: Old permit ledger
description: Load a spreadsheet of past permits as parcel history.
---

# Loading an old permit ledger

If your office kept its permits in a spreadsheet before Chiban, loading that ledger puts each old permit on the history of the parcel it names, so staff and the public can see what was permitted there before.

Each row becomes a historical record. Its type, number, date and description are public. Any other columns you choose to keep are shown to staff only.

This load runs on the server, so it is done by whoever runs Chiban, working from the ledger and a short mapping file that says which column holds what. Have a clerk who knows the ledger check the mapping before the real run.

## Running it

```
node dist/migrate-spreadsheet.mjs --file permits.xlsx --mapping mapping.json --as clerk@town.example [--dry-run]
```

The file can be `.xlsx` or `.csv`. The person named with `--as` must have the permission to manage parcel records, which administrators and land use staff have.

Run it with `--dry-run` first. A dry run reads and checks every row and writes nothing.

- A row whose date cannot be read, or that has no record type, is listed with its row number in the sheet and is not loaded.
- A row whose parcel ID matches no parcel is loaded anyway and waits under **Unresolved records** until someone matches it to a parcel.

Running the same file again skips the rows already loaded, so you can fix the mapping or the unmatched parcels and run it again.

## The mapping file

```json
{
  "sheet": "Permits",
  "headerRow": 2,
  "recordType": { "column": "Type" },
  "number": "Permit No",
  "parcel": {
    "format": "gis12",
    "parts": [
      { "column": "Map", "width": 3 },
      { "column": "Lot", "width": 3 },
      { "column": "Sub", "width": 3 },
      { "column": "Unit", "width": 3 }
    ]
  },
  "date": {
    "column": "Issued",
    "formats": ["excel_serial", "YYYY-MM-DD", "MM/DD/YYYY", "M/D/YY"],
    "twoDigitYearPivot": 30
  },
  "description": ["Work"],
  "keep": ["Contractor", "Fee", "Clerk Note"]
}
```

- `sheet`: the worksheet to read. Leave it out to use the first sheet. A `.csv` file ignores it.
- `headerRow`: the row that holds the column names. Rows above it are skipped.
- `recordType`: the column that holds the type of record, or `{ "literal": "Building permit" }` to give every row the same type.
- `number`: the column that holds the permit number.
- `parcel`: the parcel ID format and the columns that build the ID. Number parts are padded with zeros to their width, the same way as the [assessing file import](./cama-import.md). A part may also be fixed digits, such as `{ "literal": "000" }`.
- `date.formats`: the ways a date may be written in the date column. `excel_serial` is a date stored by Excel as a count of days from December 30, 1899. `M/D/YY` reads a two-digit year above `twoDigitYearPivot` as 19yy and any other as 20yy, so with a pivot of 30, `3/4/87` is March 4, 1987 and `1/2/05` is January 2, 2005. Cells that Excel stores as real dates are read in UTC.
- `description`: the columns joined to make the public description.
- `keep`: columns stored for staff and never shown to the public.

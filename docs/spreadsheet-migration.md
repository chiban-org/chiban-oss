# Historical spreadsheet migration

Load a town's old permit ledger (`.xlsx` or `.csv`) as parcel history. Each row becomes a historical record shown on the history of the parcel it names. The record's type, number, date, and description are public. The kept columns are shown to staff only.

## Running it

```
node dist/migrate-spreadsheet.mjs --file permits.xlsx --mapping mapping.json --as clerk@town.example [--dry-run]
```

The `--as` user must hold the parcel.manage capability. A dry run reads and checks every row and writes nothing. Running the same file again skips rows already loaded, so a run can be repeated after fixing the mapping or the unknown parcels.

Rows with a date that cannot be read, or with no record type, are listed with their sheet row number and are not loaded. Rows whose parcel id matches no parcel are loaded and wait in the unresolved records queue until someone matches them.

## Mapping file

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

- `sheet`: worksheet name. Omit it to use the first sheet. Ignored for `.csv`.
- `headerRow`: the row number that holds the column names. Rows above it are skipped.
- `recordType`: a column, or `{ "literal": "Building permit" }` for the same type on every row.
- `parcel`: the id format key and the columns that build the id. Numeric parts are padded with zeros to their width, the same way as the CAMA import. A part may be `{ "literal": "000" }`.
- `date.formats`: the formats allowed in the date column. `excel_serial` counts days from December 30, 1899. `M/D/YY` reads a two digit year above `twoDigitYearPivot` as 19yy and any other as 20yy, so with a pivot of 30, `3/4/87` is March 4, 1987 and `1/2/05` is January 2, 2005. Real date cells are read in UTC.
- `description`: columns joined into the public description.
- `keep`: columns stored for staff and never shown publicly.

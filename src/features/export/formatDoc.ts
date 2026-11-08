import { getTableConfig } from 'drizzle-orm/pg-core'
import type { ExportEntity } from '@/features/export/entities'
import { EXPORT_FORMAT_VERSION } from '@/features/export/manifest'

const INTRO = `# Chiban export format

Format version ${EXPORT_FORMAT_VERSION}.

This archive holds one town's records exported from Chiban. It is a standard zip file, so it
opens on any computer without extra software. The records are written three ways, as plain
text (NDJSON), as CSV, and as one Excel workbook, and every stored PDF has a PDF/A copy beside
the original bytes, so the records stay readable without Chiban. Data files are compressed;
stored documents are kept as they are.

## Layout

- \`manifest.json\`: first entry. Lists every data file and every stored file with its SHA-256.
- \`manifest.sha256\`: the SHA-256 of \`manifest.json\` in \`sha256sum\` format.
- \`FORMAT.md\`: this document.
- \`data/{entity}.ndjson\`: one JSON object per line, one file per entity, ordered by primary key.
  Keys are sorted. Timestamps are UTC with microseconds. Dates are \`YYYY-MM-DD\`. Geometry is
  GeoJSON in EPSG:4326.
- \`files/sha256/{aa}/{bb}/{sha256}\`: the exact bytes of each stored document, named by their
  SHA-256, stored once however many documents use them.
- \`tables/{entity}.csv\`: the same records as the NDJSON file, for spreadsheets (full exports
  only). See "Spreadsheet files" below.
- \`tables/chiban-export.xlsx\`: one Excel workbook with a sheet per entity (full exports only).
- \`pdfa/sha256/{aa}/{bb}/{sha256}.pdf\`: a PDF/A-2 copy of a stored PDF, named by the SHA-256 of
  the original (full exports only). See "PDF/A copies" below.

## Manifest fields

- \`format\`, \`formatVersion\`, \`kind\` (\`business\` or \`incremental\`), \`exportId\`,
  \`baseExportId\`, \`createdAt\`.
- \`town\`: name, state, time zone. \`appVersion\`, \`pack\`, \`migrationHead\`: the software that
  wrote the archive.
- \`entities[]\`: \`name\`, \`path\`, \`count\`, \`sha256\`, \`inExport\`.
- \`files[]\`: \`sha256\`, \`size\`, \`contentType\`, \`path\`, \`inExport\`.
- \`inExport\` is the export whose archive holds the bytes. In a full export it equals
  \`exportId\`. In an incremental export an unchanged entity or file points at the earlier export.

- \`tables\` (full exports only): \`csv[]\` with \`entity\`, \`path\`, \`count\`, \`sha256\`, \`size\`, and
  \`workbook\` with \`path\`, \`sha256\`, \`size\`, and \`sheets[]\` of \`entity\`, \`name\`, \`rows\`.
- \`pdfa\` (full exports only): one entry per stored PDF with \`sourceSha256\`, \`status\`, \`path\`,
  \`sha256\`, \`size\`, \`reason\`, \`detail\`. \`status\` is \`stored\` when the town already held a
  PDF/A copy (\`path\` points into \`files/\`; a PDF that is itself a PDF/A copy points to
  itself), \`converted\` when the export made the copy (\`path\` points into \`pdfa/\`), or
  \`failed\` when the PDF could not be converted (\`path\` is null and \`reason\` and \`detail\` say
  why). A failed conversion never stops the export, and the original is always kept.

## Spreadsheet files

Each CSV has a header row of column names, sorted alphabetically, then one row per record in
the same order as the NDJSON file. Files are UTF-8 with a byte order mark so Excel opens them
correctly, fields are separated by commas, quoted when they hold a comma, quote, or line break,
and lines end with CR LF (RFC 4180). A missing value is an empty cell. Objects and lists are not
split into columns: they are written as JSON text inside the cell. Text that would start a
formula in a spreadsheet (it begins with \`=\`, \`+\`, \`-\`, \`@\`, a tab, or a carriage return) has a
single quote placed in front of it in the CSV files, so the NDJSON files remain the exact record.

The workbook has one sheet per entity, named after the entity and cut to Excel's limit of 31
characters (a numeric suffix keeps names unique). Cells hold text, numbers, and true or false.
An entity with more rows than one sheet can hold continues on a sheet whose name ends in
\`_2\`, \`_3\`, and so on, each repeating the header row. A cell longer than Excel's limit of
32,767 characters is cut there in the workbook only; the CSV and NDJSON hold the full value.

## PDF/A copies

Every stored PDF has a PDF/A-2 copy in the archive, so the records can be kept in the archival
format. Copies the town already holds are reused; the rest are converted with Ghostscript while
the export is prepared. Original files are never changed or removed.

Credentials never appear in an archive: password hashes, authenticator secrets, payment
processor keys, calendar secrets, and sign-in or link tokens are omitted. Records that need them
are restored without them and must be set up again.

## Entities
`

function describe(entity: ExportEntity): string {
  const config = getTableConfig(entity.table)
  const omitted = new Set(entity.omitColumns)
  const lines = [
    `### ${entity.name}`,
    '',
    `File: \`${entity.file}\`. Ordered by ${entity.orderBy.join(', ')}.`,
    '',
  ]
  for (const column of config.columns) {
    if (omitted.has(column.name)) continue
    const nullable = column.notNull ? '' : ', nullable'
    lines.push(`- \`${column.name}\`: ${column.getSQLType()}${nullable}`)
  }
  if (entity.refs.length > 0) {
    lines.push('', 'References:')
    for (const ref of entity.refs) lines.push(`- \`${ref.column}\` refers to \`${ref.entity}\``)
  }
  if (entity.polyRefs.length > 0) {
    lines.push('', 'Typed references:')
    for (const poly of entity.polyRefs) {
      const kinds = Object.entries(poly.map)
        .map(([kind, target]) => `${kind} to \`${target}\``)
        .join(', ')
      lines.push(`- \`${poly.idColumn}\` by \`${poly.kindColumn}\`: ${kinds}`)
    }
  }
  if (entity.omitColumns.length > 0) {
    lines.push('', `Omitted columns: ${entity.omitColumns.map((c) => `\`${c}\``).join(', ')}`)
  }
  return lines.join('\n')
}

export function renderFormatDoc(entities: ExportEntity[]): string {
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name))
  return `${INTRO}\n${sorted.map(describe).join('\n\n')}\n`
}

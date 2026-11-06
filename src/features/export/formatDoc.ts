import { getTableConfig } from 'drizzle-orm/pg-core'
import type { ExportEntity } from '@/features/export/entities'
import { EXPORT_FORMAT_VERSION } from '@/features/export/manifest'

const INTRO = `# Chiban export format

Format version ${EXPORT_FORMAT_VERSION}.

This archive holds one town's records exported from Chiban. It is a standard zip file, so it
opens on any computer without extra software. Every file inside is plain text or the original
bytes of a stored document, so the records stay readable without Chiban. Data files are
compressed; stored documents are kept as they are.

## Layout

- \`manifest.json\`: first entry. Lists every data file and every stored file with its SHA-256.
- \`manifest.sha256\`: the SHA-256 of \`manifest.json\` in \`sha256sum\` format.
- \`FORMAT.md\`: this document.
- \`data/{entity}.ndjson\`: one JSON object per line, one file per entity, ordered by primary key.
  Keys are sorted. Timestamps are UTC with microseconds. Dates are \`YYYY-MM-DD\`. Geometry is
  GeoJSON in EPSG:4326.
- \`files/sha256/{aa}/{bb}/{sha256}\`: the exact bytes of each stored document, named by their
  SHA-256, stored once however many documents use them.

## Manifest fields

- \`format\`, \`formatVersion\`, \`kind\` (\`business\` or \`incremental\`), \`exportId\`,
  \`baseExportId\`, \`createdAt\`.
- \`town\`: name, state, time zone. \`appVersion\`, \`pack\`, \`migrationHead\`: the software that
  wrote the archive.
- \`entities[]\`: \`name\`, \`path\`, \`count\`, \`sha256\`, \`inExport\`.
- \`files[]\`: \`sha256\`, \`size\`, \`contentType\`, \`path\`, \`inExport\`.
- \`inExport\` is the export whose archive holds the bytes. In a full export it equals
  \`exportId\`. In an incremental export an unchanged entity or file points at the earlier export.

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

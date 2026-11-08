import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { canonicalJson } from '@/features/export/canonical'
import type { ExportEntity } from '@/features/export/entities'
import type { EntityTable } from '@/features/export/tabular/tableSet'

const FETCH_ROWS = 500

function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function selectRowSql(entity: ExportEntity): string {
  const omitted =
    entity.omitColumns.length === 0
      ? ''
      : ` - ARRAY[${entity.omitColumns.map((c) => `'${c.replaceAll("'", "''")}'`).join(',')}]::text[]`
  const order = entity.orderBy.map(ident).join(', ')
  return `select to_jsonb(t)${omitted} as row from ${ident(entity.name)} t order by ${order}`
}

export interface DumpedEntity {
  count: number
  sha256: string
  size: number
  table: { sha256: string; size: number } | null
}

export async function dumpEntity(
  tx: Tx,
  entity: ExportEntity,
  filePath: string,
  signal: AbortSignal,
  table: EntityTable | null = null,
): Promise<DumpedEntity> {
  const hash = createHash('sha256')
  const out = createWriteStream(filePath)
  let count = 0
  let size = 0
  const cursor = `c_${entity.name}`
  await tx.execute(sql.raw(`declare ${ident(cursor)} no scroll cursor for ${selectRowSql(entity)}`))
  for (;;) {
    signal.throwIfAborted()
    const batch = await tx.execute<{ row: unknown }>(
      sql.raw(`fetch ${FETCH_ROWS} from ${ident(cursor)}`),
    )
    if (batch.rows.length === 0) break
    let chunk = ''
    for (const r of batch.rows) {
      chunk += `${canonicalJson(r.row)}\n`
      count += 1
      if (table !== null) await table.add(r.row as Record<string, unknown>)
    }
    const buf = Buffer.from(chunk, 'utf8')
    hash.update(buf)
    size += buf.length
    if (!out.write(buf)) await once(out, 'drain')
  }
  await tx.execute(sql.raw(`close ${ident(cursor)}`))
  out.end()
  await once(out, 'close')
  const tableDone = table === null ? null : await table.end()
  return { count, sha256: hash.digest('hex'), size, table: tableDone }
}

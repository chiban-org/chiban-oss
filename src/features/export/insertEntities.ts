import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { Tx } from '@/db/client'
import { EXPORT_ENTITIES, type ExportEntity, exportOrder } from '@/features/export/entities'

const BATCH_ROWS = 500

function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

async function insertRows(tx: Tx, entity: ExportEntity, lines: string[]): Promise<void> {
  if (lines.length === 0) return
  const omitted = new Set(entity.omitColumns)
  const columns = getTableConfig(entity.table)
    .columns.map((c) => c.name)
    .filter((c) => !omitted.has(c))
  const fillColumns = Object.keys(entity.omitFill)
  const insertList = [...columns, ...fillColumns].map(ident).join(', ')
  const selectList = [...columns.map(ident), ...Object.values(entity.omitFill)].join(', ')
  const head = `insert into ${ident(entity.name)} (${insertList}) select ${selectList} from jsonb_populate_recordset(null::${ident(entity.name)}, `
  await tx.execute(sql`${sql.raw(head)}${`[${lines.join(',')}]`}::jsonb)`)
}

async function readLines(path: string): Promise<string[]> {
  const out: string[] = []
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Number.POSITIVE_INFINITY })
  for await (const line of rl) if (line.length > 0) out.push(line)
  return out
}

async function insertEntity(tx: Tx, entity: ExportEntity, path: string): Promise<void> {
  if (entity.importMode === 'replace') {
    await tx.execute(sql.raw(`delete from ${ident(entity.name)}`))
  }
  const lines = await readLines(path)
  const selfReferencing = entity.refs.some((r) => r.entity === entity.name)
  if (selfReferencing) {
    await insertRows(tx, entity, lines)
    return
  }
  for (let i = 0; i < lines.length; i += BATCH_ROWS) {
    await insertRows(tx, entity, lines.slice(i, i + BATCH_ROWS))
  }
}

async function resetSequences(tx: Tx): Promise<void> {
  const serials = await tx.execute<{ table_name: string; column_name: string }>(sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and column_default like 'nextval%'`)
  const exported = new Set(EXPORT_ENTITIES.map((e) => e.name))
  for (const s of serials.rows) {
    if (!exported.has(s.table_name)) continue
    await tx.execute(
      sql.raw(
        `select setval(pg_get_serial_sequence('${ident(s.table_name)}', '${s.column_name}'), coalesce((select max(${ident(s.column_name)}) from ${ident(s.table_name)}), 0) + 1, false)`,
      ),
    )
  }
}

async function danglingPolyRefs(tx: Tx): Promise<string[]> {
  const dangling: string[] = []
  for (const entity of EXPORT_ENTITIES) {
    for (const poly of entity.polyRefs) {
      for (const [kind, target] of Object.entries(poly.map)) {
        const found = await tx.execute<{ n: number }>(
          sql.raw(
            `select count(*)::int as n from ${ident(entity.name)} t where t.${ident(poly.kindColumn)} = '${kind}' and not exists (select 1 from ${ident(target)} x where x.id = t.${ident(poly.idColumn)})`,
          ),
        )
        if ((found.rows[0]?.n ?? 0) > 0) {
          dangling.push(`${entity.name}.${poly.idColumn} (${kind})`)
        }
      }
    }
  }
  return dangling
}

export class DanglingRefs extends Error {
  readonly refs: string[]

  constructor(refs: string[]) {
    super('archive has references that do not resolve')
    this.refs = refs
  }
}

export async function insertAllEntities(
  tx: Tx,
  workDir: string,
  signal: AbortSignal,
): Promise<void> {
  for (const entity of exportOrder(EXPORT_ENTITIES)) {
    signal.throwIfAborted()
    await insertEntity(tx, entity, join(workDir, `${entity.name}.ndjson`))
  }
  await resetSequences(tx)
  const dangling = await danglingPolyRefs(tx)
  if (dangling.length > 0) throw new DanglingRefs(dangling)
}

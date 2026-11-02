import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { canonicalJson } from '@/features/export/canonical'
import { EXPORT_ENTITIES, type ExportEntity } from '@/features/export/entities'

export interface TownDifference {
  entity: string
  onlyInA: number
  onlyInB: number
  differing: number
}

function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

async function canonicalRows(db: Db, entity: ExportEntity): Promise<Map<string, string>> {
  const omitted =
    entity.omitColumns.length === 0
      ? ''
      : ` - ARRAY[${entity.omitColumns.map((c) => `'${c}'`).join(',')}]::text[]`
  const order = entity.orderBy.map(ident).join(', ')
  const keys = entity.orderBy.map((c) => `t.${ident(c)}::text`).join(` || '|' || `)
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`set local time zone 'UTC'`)
    return await tx.execute<{ key: string; row: unknown }>(
      sql.raw(
        `select ${keys} as key, to_jsonb(t)${omitted} as row from ${ident(entity.name)} t order by ${order}`,
      ),
    )
  })
  return new Map(rows.rows.map((r) => [r.key, canonicalJson(r.row)]))
}

export async function compareTowns(a: Db, b: Db, signal: AbortSignal): Promise<TownDifference[]> {
  const result: TownDifference[] = []
  for (const entity of EXPORT_ENTITIES) {
    signal.throwIfAborted()
    const [left, right] = [await canonicalRows(a, entity), await canonicalRows(b, entity)]
    let differing = 0
    let onlyInA = 0
    for (const [key, value] of left) {
      const other = right.get(key)
      if (other === undefined) onlyInA += 1
      else if (other !== value) differing += 1
    }
    const onlyInB = [...right.keys()].filter((k) => !left.has(k)).length
    result.push({ entity: entity.name, onlyInA, onlyInB, differing })
  }
  return result
}

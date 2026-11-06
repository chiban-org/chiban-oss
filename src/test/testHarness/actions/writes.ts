import type { Pool } from 'pg'

export type TableFingerprint = ReadonlyMap<string, string>

const TABLES_SQL = `select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`

function fingerprintSql(tables: readonly string[]): string {
  return tables
    .map(
      (table) =>
        `select '${table}' as name, md5(coalesce(string_agg(t::text, E'\\n' order by t::text), '')) as digest from "${table}" t`,
    )
    .join(' union all ')
}

export async function fingerprint(pool: Pool): Promise<TableFingerprint> {
  const tables = await pool.query<{ table_name: string }>(TABLES_SQL)
  const names = tables.rows.map((r) => r.table_name)
  const digests = await pool.query<{ name: string; digest: string }>(fingerprintSql(names))
  return new Map(digests.rows.map((r) => [r.name, r.digest]))
}

export function changedTables(before: TableFingerprint, after: TableFingerprint): string[] {
  const names = new Set([...before.keys(), ...after.keys()])
  return [...names].filter((name) => before.get(name) !== after.get(name)).sort()
}

export async function recordWrites<T>(
  pool: Pool,
  run: () => Promise<T>,
): Promise<{ value: T; written: string[] }> {
  const before = await fingerprint(pool)
  const value = await run()
  return { value, written: changedTables(before, await fingerprint(pool)) }
}

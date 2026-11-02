import { type SQL, sql } from 'drizzle-orm'

export function uuidArray(ids: readonly string[]): SQL {
  if (ids.length === 0) return sql`array[]::uuid[]`
  return sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`
}

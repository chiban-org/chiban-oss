import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'

export async function databaseContains(db: Db, needle: string): Promise<string[]> {
  const tables = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  )
  const hits: string[] = []
  for (const { table_name } of tables.rows) {
    const found = await db.execute<{ n: number }>(
      sql.raw(
        `select count(*)::int as n from "${table_name}" t where t::text like '%${needle.replaceAll("'", "''")}%'`,
      ),
    )
    if ((found.rows[0]?.n ?? 0) > 0) hits.push(table_name)
  }
  return hits
}

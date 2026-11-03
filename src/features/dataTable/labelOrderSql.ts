import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'

export function labelOrderSql(
  column: SQLWrapper,
  values: readonly string[],
  labelOf: (value: string) => string,
): SQL {
  const ranked = [...values].sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
  const branches = ranked.map((value, rank) => sql`when ${value} then ${sql.raw(String(rank))}`)
  return sql`(case ${column} ${sql.join(branches, sql` `)} end)`
}

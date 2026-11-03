import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import { loadPack } from '@/features/packs/loadPack'

export function seriesLabelSql(seriesKey: SQLWrapper): SQL {
  const branches = loadPack().recordSeries.map((s) => sql`when ${s.key} then ${s.label}`)
  return sql`(case ${seriesKey} ${sql.join(branches, sql` `)} else ${seriesKey} end)`
}

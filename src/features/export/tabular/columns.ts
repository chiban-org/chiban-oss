import { getTableConfig } from 'drizzle-orm/pg-core'
import type { ExportEntity } from '@/features/export/entities'

export function entityColumns(entity: ExportEntity): string[] {
  const omitted = new Set(entity.omitColumns)
  return getTableConfig(entity.table)
    .columns.map((c) => c.name)
    .filter((name) => !omitted.has(name))
    .sort()
}

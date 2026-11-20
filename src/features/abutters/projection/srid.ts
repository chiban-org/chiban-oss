import { sql } from 'drizzle-orm'
import { activePack } from '@/features/packs/registry'

export function projectedSrid(): number {
  return activePack().spatial.projectedSrid
}

export function projectedSridParam() {
  return sql`${projectedSrid()}::int`
}

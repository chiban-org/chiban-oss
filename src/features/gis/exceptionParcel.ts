import { type SQL, sql } from 'drizzle-orm'
import { importExceptions, parcelAliases } from '@/db/schema'

export function exceptionOnParcel(parcelId: string): SQL {
  return sql`(${importExceptions.rowKey} in (select 'id:' || ${parcelAliases.value} from ${parcelAliases} where ${parcelAliases.parcelId} = ${parcelId}::uuid) or ${importExceptions.payload}->>'parcelId' = ${parcelId})`
}

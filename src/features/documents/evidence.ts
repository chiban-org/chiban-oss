import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { documents } from '@/db/schema'
import { EVIDENCE_KINDS } from '@/features/documents/types'

export function evidenceOf(applicationId: string): SQL {
  return (
    and(
      eq(documents.recordKind, 'application'),
      eq(documents.recordId, applicationId),
      inArray(documents.docKind, [...EVIDENCE_KINDS]),
    ) ?? sql`false`
  )
}

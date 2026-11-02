import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections } from '@/db/schema'

export async function applicationIdOfRecord(
  db: DbOrTx,
  record: { recordKind: string; recordId: string },
): Promise<string | null> {
  if (record.recordKind === 'application') return record.recordId
  if (record.recordKind !== 'inspection') return null
  const [row] = await db
    .select({ applicationId: inspections.applicationId })
    .from(inspections)
    .where(eq(inspections.id, record.recordId))
  return row?.applicationId ?? null
}

import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, ledgerAllocations, ledgerEntries, projects } from '@/db/schema'
import { feeBalance } from '@/features/ledger/feeBalance'

export interface ReturnedCheckNotice {
  applicationId: string
  number: string
  dueCents: number
}

export async function returnedCheckNotices(
  db: Db,
  applicationIds: string[],
  signal: AbortSignal,
): Promise<ReturnedCheckNotice[]> {
  signal.throwIfAborted()
  if (applicationIds.length === 0) return []
  const returned = await db
    .selectDistinct({ applicationId: ledgerAllocations.applicationId, number: applications.number })
    .from(ledgerEntries)
    .innerJoin(ledgerAllocations, eq(ledgerAllocations.entryId, ledgerEntries.id))
    .innerJoin(applications, eq(applications.id, ledgerAllocations.applicationId))
    .where(
      and(
        eq(ledgerEntries.entryType, 'returned_check'),
        inArray(ledgerAllocations.applicationId, applicationIds),
      ),
    )
  const notices: ReturnedCheckNotice[] = []
  for (const row of returned) {
    if (row.applicationId === null) continue
    const { dueCents } = await feeBalance(db, row.applicationId, signal)
    if (dueCents > 0)
      notices.push({ applicationId: row.applicationId, number: row.number, dueCents })
  }
  return notices
}

export async function returnedCheckNoticesForParcel(
  db: Db,
  parcelId: string,
  signal: AbortSignal,
): Promise<ReturnedCheckNotice[]> {
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(projects.parcelId, parcelId))
  return await returnedCheckNotices(
    db,
    rows.map((r) => r.id),
    signal,
  )
}

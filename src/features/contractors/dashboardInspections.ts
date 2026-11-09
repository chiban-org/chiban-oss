import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections } from '@/db/schema'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export interface ScheduledInspection {
  date: CivilDate
  startMinute: number | null
  typeLabel: string
}

export interface InspectionSummary {
  resultsOwed: ScheduledInspection[]
  upcoming: ScheduledInspection[]
}

export async function inspectionsFor(
  db: DbOrTx,
  applicationIds: readonly string[],
  today: CivilDate,
): Promise<Map<string, InspectionSummary>> {
  const out = new Map<string, InspectionSummary>()
  if (applicationIds.length === 0) return out
  const rows = await db
    .select({
      applicationId: inspections.applicationId,
      inspectionType: inspections.inspectionType,
      scheduledDate: inspections.scheduledDate,
      startMinute: inspections.startMinute,
    })
    .from(inspections)
    .where(
      and(
        inArray(inspections.applicationId, [...applicationIds]),
        eq(inspections.status, 'scheduled'),
        isNotNull(inspections.scheduledDate),
      ),
    )
    .orderBy(asc(inspections.scheduledDate), asc(inspections.startMinute))
  for (const row of rows) {
    const entry = out.get(row.applicationId) ?? { resultsOwed: [], upcoming: [] }
    const date = row.scheduledDate as CivilDate
    const item = {
      date,
      startMinute: row.startMinute,
      typeLabel: inspectionTypeLabel(row.inspectionType),
    }
    if (compareCivil(date, today) < 0) entry.resultsOwed.push(item)
    else entry.upcoming.push(item)
    out.set(row.applicationId, entry)
  }
  return out
}

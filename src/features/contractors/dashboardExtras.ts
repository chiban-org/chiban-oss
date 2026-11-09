import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import { missingDocumentsFor } from '@/features/contractors/dashboardDocuments'
import {
  type InspectionSummary,
  inspectionsFor,
  type ScheduledInspection,
} from '@/features/contractors/dashboardInspections'
import { dueCentsFor } from '@/features/contractors/dashboardMoney'
import type { CivilDate } from '@/types/civilDate'

export interface ApplicationExtras {
  dueCents: number
  resultsOwed: ScheduledInspection[]
  upcoming: ScheduledInspection[]
  missingDocuments: string[]
}

const NONE: InspectionSummary = { resultsOwed: [], upcoming: [] }

export async function loadExtras(
  db: DbOrTx,
  applicationIds: readonly string[],
  today: CivilDate,
  signal: AbortSignal,
): Promise<Map<string, ApplicationExtras>> {
  const out = new Map<string, ApplicationExtras>()
  if (applicationIds.length === 0) return out
  const ids = [...new Set(applicationIds)]
  const apps = await db.select().from(applications).where(inArray(applications.id, ids))
  const [due, inspected, missing] = await Promise.all([
    dueCentsFor(db, ids),
    inspectionsFor(db, ids, today),
    missingDocumentsFor(db, apps, signal),
  ])
  for (const id of ids) {
    const inspection = inspected.get(id) ?? NONE
    out.set(id, {
      dueCents: due.get(id) ?? 0,
      resultsOwed: inspection.resultsOwed,
      upcoming: inspection.upcoming,
      missingDocuments: missing.get(id) ?? [],
    })
  }
  return out
}

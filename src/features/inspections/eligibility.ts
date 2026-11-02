import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, inspections } from '@/db/schema'
import type { ConfigPins } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import { type ChecklistBody, isFinalChecklist } from '@/features/inspections/checklistSchema'
import type { InspectableType } from '@/features/inspections/types'

export async function inspectableTypes(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<InspectableType[]> {
  signal.throwIfAborted()
  const [app] = await db
    .select({ pins: applications.configPins })
    .from(applications)
    .where(eq(applications.id, applicationId))
  if (app === undefined) return []
  const types: InspectableType[] = []
  for (const checklistVersionId of (app.pins as ConfigPins).checklists) {
    const version = await getVersion(db, checklistVersionId, signal)
    if (version === null) continue
    const body = version.body as ChecklistBody
    types.push({
      checklistVersionId,
      inspectionType: body.inspectionType,
      label: body.label,
      final: isFinalChecklist(body),
    })
  }
  return types
}

export type TypeTaken = 'inspection_already_open' | 'inspection_already_passed'

async function takenTypes(db: DbOrTx, applicationId: string): Promise<Map<string, TypeTaken>> {
  const rows = await db
    .select({ inspectionType: inspections.inspectionType, status: inspections.status })
    .from(inspections)
    .where(
      and(
        eq(inspections.applicationId, applicationId),
        inArray(inspections.status, ['requested', 'scheduled', 'passed']),
      ),
    )
  const taken = new Map<string, TypeTaken>()
  for (const row of rows) {
    if (row.status === 'passed') taken.set(row.inspectionType, 'inspection_already_passed')
    else if (!taken.has(row.inspectionType)) {
      taken.set(row.inspectionType, 'inspection_already_open')
    }
  }
  return taken
}

export async function typeTaken(
  db: DbOrTx,
  applicationId: string,
  inspectionType: string,
): Promise<TypeTaken | null> {
  return (await takenTypes(db, applicationId)).get(inspectionType) ?? null
}

export async function requestableTypes(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<InspectableType[]> {
  const types = await inspectableTypes(db, applicationId, signal)
  const taken = await takenTypes(db, applicationId)
  return types.filter((t) => !taken.has(t.inspectionType))
}

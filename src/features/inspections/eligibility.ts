import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import type { ConfigPins } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
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
      final: body.final === true,
    })
  }
  return types
}

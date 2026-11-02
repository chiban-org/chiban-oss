import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { substepLabel } from '@/features/applications/statusText'
import { getVersion } from '@/features/config/store'

export async function substepLabelsFor(
  db: DbOrTx,
  applicationIds: string[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (applicationIds.length === 0) return out
  const rows = await db
    .select({
      id: applications.id,
      substep: applications.substep,
      configPins: applications.configPins,
    })
    .from(applications)
    .where(inArray(applications.id, applicationIds))
  for (const row of rows) {
    if (row.substep === null) continue
    const version = await getVersion(
      db,
      (row.configPins as { applicationType: string }).applicationType,
      signal,
    )
    const body = version?.body as ApplicationTypeBody | undefined
    out.set(row.id, substepLabel(row.substep, body?.workflow.substeps ?? []))
  }
  return out
}

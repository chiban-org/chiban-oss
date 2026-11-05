import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { CoreState } from '@/features/applications/states'
import type { ConfigPins } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import type { FieldValue, ProjectFacts } from '@/features/forms/validateSubmission'
import type { CivilDate } from '@/types/civilDate'

export interface ApplicationContext {
  id: string
  number: string
  projectId: string
  state: CoreState
  substep: string | null
  rowVersion: number
  facts: ProjectFacts
  values: Record<string, FieldValue>
  typeBody: ApplicationTypeBody
  pins: ConfigPins
  receivedDate: CivilDate | null
  completedDate: CivilDate | null
  decidedOn: CivilDate | null
  issuedOn: CivilDate | null
  closureReason: string | null
  permitRevision: number
  permitCorrectedOn: CivilDate | null
}

export async function loadApplicationContext(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<ApplicationContext | null> {
  signal.throwIfAborted()
  const [row] = await db.select().from(applications).where(eq(applications.id, applicationId))
  if (row === undefined) return null
  const pins = row.configPins as ConfigPins
  const type = await getVersion(db, pins.applicationType, signal)
  if (type === null) return null
  return {
    id: row.id,
    number: row.number,
    projectId: row.projectId,
    state: row.state as CoreState,
    substep: row.substep,
    rowVersion: row.rowVersion,
    facts: row.facts as ProjectFacts,
    values: row.values as Record<string, FieldValue>,
    typeBody: type.body as ApplicationTypeBody,
    pins,
    receivedDate: row.receivedDate as CivilDate | null,
    completedDate: row.completedDate as CivilDate | null,
    decidedOn: row.decidedOn as CivilDate | null,
    issuedOn: row.issuedOn as CivilDate | null,
    closureReason: row.closureReason,
    permitRevision: row.permitRevision,
    permitCorrectedOn: row.permitCorrectedOn as CivilDate | null,
  }
}

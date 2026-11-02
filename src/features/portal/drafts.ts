import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, configVersions, parcels } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { canViewApplication } from '@/features/access/queries'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { loadApplicationContext } from '@/features/applications/context'
import { createApplication } from '@/features/applications/createApplication'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import { type FieldError, validateSubmission } from '@/features/forms/validateSubmission'
import { displayIdsFor } from '@/features/parcels/displayId'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import { createProject } from '@/features/projects/projects'
import { err, ok, type Result } from '@/types/result'

export interface PortalType {
  key: string
  label: string
}

export async function listPortalTypes(db: Db, signal: AbortSignal): Promise<PortalType[]> {
  signal.throwIfAborted()
  const rows = await db
    .select()
    .from(configVersions)
    .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.status, 'published')))
  return rows
    .map((r) => ({ key: r.key, label: (r.body as ApplicationTypeBody).label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export type StartError = 'unknown_parcel' | 'not_published' | 'config_inconsistent' | 'forbidden'

export async function startApplication(
  db: Db,
  actor: Actor,
  input: { parcelId: string; applicationTypeKey: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ applicationId: string; number: string; projectId: string }, StartError>> {
  signal.throwIfAborted()
  const types = await listPortalTypes(db, signal)
  const type = types.find((t) => t.key === input.applicationTypeKey)
  if (type === undefined) return err('not_published')
  return await transactionResult<
    { applicationId: string; number: string; projectId: string },
    StartError
  >(db, async (tx) => {
    const [parcel] = await tx
      .select({ siteAddress: parcels.siteAddress })
      .from(parcels)
      .where(eq(parcels.id, input.parcelId))
    if (parcel === undefined) return err('unknown_parcel')
    const display = await displayIdsFor(tx, [input.parcelId])
    const where = parcel.siteAddress ?? display.get(input.parcelId) ?? 'parcel on file'
    const project = await createProject(
      tx,
      actor,
      { parcelId: input.parcelId, title: `${type.label}, ${where}` },
      signal,
    )
    if (!project.ok) return err('unknown_parcel')
    const created = await createApplication(
      tx,
      actor,
      { projectId: project.value.projectId, applicationTypeKey: input.applicationTypeKey },
      signal,
      now,
    )
    if (!created.ok) return err(created.error)
    return ok({ ...created.value, projectId: project.value.projectId })
  })
}

export type DraftError = 'not_found' | 'not_draft' | { fieldErrors: FieldError[] }

export async function saveDraftValues(
  db: Db,
  actor: Actor,
  input: { applicationId: string; values: Record<string, unknown> },
  signal: AbortSignal,
): Promise<Result<{ rowVersion: number }, DraftError>> {
  signal.throwIfAborted()
  if (!(await canViewApplication(db, actor, input.applicationId, signal))) return err('not_found')
  return await transactionResult<{ rowVersion: number }, DraftError>(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const mayEdit =
      hasFullRecordAccess(actor) || (await isActiveParty(tx, actor.userId, app.projectId))
    if (!mayEdit) return err('not_found')
    if (app.state !== 'draft') return err('not_draft')
    const form = (await getVersion(tx, app.pins.form, signal))?.body as FormBody
    const checked = validateSubmission(form, input.values, {
      asStaff: hasFullRecordAccess(actor),
      partial: true,
    })
    if (!checked.ok) return err({ fieldErrors: checked.error })
    const rowVersion = app.rowVersion + 1
    await tx
      .update(applications)
      .set({
        values: checked.value.values,
        facts: checked.value.facts,
        rowVersion,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, input.applicationId))
    return ok({ rowVersion })
  })
}

import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { cutoverRows, users } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { createApplication } from '@/features/applications/createApplication'
import { type CoreState, isTransitionAllowed } from '@/features/applications/states'
import { submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { markComplete } from '@/features/building/completeness'
import { getVersion } from '@/features/config/store'
import type { CutoverRow } from '@/features/cutover/parseRows'
import { createFeeOverride } from '@/features/fees/feeOverrides'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { addParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const NUMERIC_FIELDS = ['integer', 'decimal']
const STEPS: readonly CoreState[] = ['under_review', 'decided', 'issued']

function coerce(
  form: FormBody | undefined,
  fields: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields }
  for (const field of form?.fields ?? []) {
    const raw = fields[field.key]
    if (raw !== undefined && NUMERIC_FIELDS.includes(field.type) && raw !== '') {
      const n = Number(raw)
      if (!Number.isNaN(n)) out[field.key] = n
    }
  }
  return out
}

function dateFor(row: CutoverRow, to: CoreState): CivilDate {
  if (to === 'under_review') return row.completedDate ?? row.receivedDate
  if (to === 'decided')
    return row.decidedOn ?? row.issuedOn ?? row.completedDate ?? row.receivedDate
  return row.issuedOn ?? row.decidedOn ?? row.receivedDate
}

async function addParties(
  tx: Tx,
  actor: Actor,
  projectId: string,
  row: CutoverRow,
  signal: AbortSignal,
): Promise<boolean> {
  const parties = [
    { role: 'applicant' as const, name: row.applicantName, email: row.applicantEmail },
    ...(row.ownerName === undefined
      ? []
      : [{ role: 'owner' as const, name: row.ownerName, email: undefined }]),
    ...(row.contractorName === undefined
      ? []
      : [{ role: 'contractor' as const, name: row.contractorName, email: row.contractorEmail }]),
  ]
  for (const party of parties) {
    const added = await addParty(
      tx,
      actor,
      {
        projectId,
        role: party.role,
        name: party.name,
        ...(party.email === undefined ? {} : { email: party.email }),
      },
      signal,
    )
    if (!added.ok) return false
  }
  return true
}

async function waiveAllLines(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  row: CutoverRow,
  signal: AbortSignal,
): Promise<boolean> {
  const app = await loadApplicationContext(tx, applicationId, signal)
  const schedule = app === null ? null : await getVersion(tx, app.pins.feeSchedule, signal)
  for (const line of (schedule?.body as FeeScheduleBody | undefined)?.lines ?? []) {
    const waived = await createFeeOverride(
      tx,
      actor,
      {
        applicationId,
        feeCode: line.code,
        kind: 'waive',
        reason: `Paid in prior system: ${row.priorReceiptRef}`,
      },
      signal,
    )
    if (!waived.ok) return false
  }
  return true
}

async function carryState(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  row: CutoverRow,
  signal: AbortSignal,
): Promise<boolean> {
  const target = STEPS.indexOf(row.state)
  for (const step of STEPS.slice(0, target + 1)) {
    const app = await loadApplicationContext(tx, applicationId, signal)
    if (app === null || !isTransitionAllowed(app.state, step, app.typeBody.workflow)) continue
    const moved = await transitionApplication(
      tx,
      actor,
      {
        applicationId,
        to: step,
        expectedRowVersion: app.rowVersion,
        onDate: dateFor(row, step),
        cutover: true,
      },
      signal,
    )
    if (!moved.ok) return false
  }
  return true
}

async function createRecord(
  tx: Tx,
  actor: Actor,
  row: CutoverRow,
  signal: AbortSignal,
): Promise<Result<{ applicationId: string; number: string }, string[]>> {
  const ref = {
    value: row.parcelId,
    ...(row.parcelFormat === undefined ? {} : { format: row.parcelFormat }),
  }
  const parcel = await resolveParcelId(tx, ref, signal)
  if (!parcel.ok) return err(['parcel_not_found'])
  const project = await createProject(
    tx,
    actor,
    { parcelId: parcel.value.parcelId, title: row.projectTitle },
    signal,
  )
  if (!project.ok) return err(['parcel_not_found'])
  if (!(await addParties(tx, actor, project.value.projectId, row, signal))) {
    return err(['party_refused'])
  }
  const made = await createApplication(
    tx,
    actor,
    { projectId: project.value.projectId, applicationTypeKey: row.applicationTypeKey },
    signal,
    new Date(`${row.receivedDate}T17:00:00Z`),
  )
  return made.ok ? ok(made.value) : err(['unknown_application_type'])
}

async function submitRecord(
  tx: Tx,
  actor: Actor,
  row: CutoverRow,
  applicationId: string,
  signal: AbortSignal,
): Promise<string[] | null> {
  const context = await loadApplicationContext(tx, applicationId, signal)
  const form = context === null ? null : await getVersion(tx, context.pins.form, signal)
  const [staff] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, actor.userId))
  const licence: Record<string, string> =
    row.contractorLicenseNumber === undefined
      ? {}
      : { contractor_license_number: row.contractorLicenseNumber }
  const submitted = await submitApplication(
    tx,
    actor,
    {
      applicationId,
      values: coerce(form?.body as FormBody | undefined, { ...licence, ...row.fields }),
      attestation: { statementSha256: '' },
      cutover: { receivedDate: row.receivedDate, enteredBy: staff?.name ?? 'staff' },
    },
    signal,
  )
  if (submitted.ok) return null
  if (typeof submitted.error === 'string') return [`submit_${submitted.error}`]
  return submitted.error.fieldErrors.map((e) => `${e.field}: ${e.code}`)
}

export async function importRow(
  tx: Tx,
  actor: Actor,
  row: CutoverRow,
  sourceSha256: string,
  signal: AbortSignal,
  now: Date,
): Promise<Result<{ applicationId: string; number: string }, string[]>> {
  const today = await townToday(tx, now, signal)
  const dates = [row.receivedDate, row.completedDate, row.decidedOn, row.issuedOn]
  if (dates.some((d) => d !== null && d > today)) return err(['future_date'])
  const created = await createRecord(tx, actor, row, signal)
  if (!created.ok) return created
  const { applicationId } = created.value
  if (row.feesPaid && !(await waiveAllLines(tx, actor, applicationId, row, signal))) {
    return err(['fee_waiver_refused'])
  }
  const refused = await submitRecord(tx, actor, row, applicationId, signal)
  if (refused !== null) return err(refused)
  if (row.completedDate !== null) {
    const complete = await markComplete(
      tx,
      actor,
      { applicationId, completedDate: row.completedDate },
      signal,
      now,
    )
    if (!complete.ok) return err([`complete_${complete.error}`])
  }
  if (!(await carryState(tx, actor, applicationId, row, signal))) return err(['state_not_carried'])
  await tx.insert(cutoverRows).values({
    legacyNumber: row.legacyNumber,
    applicationId,
    importedBy: actor.userId,
    sourceSha256,
  })
  return ok(created.value)
}

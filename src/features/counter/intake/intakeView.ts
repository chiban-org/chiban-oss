import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { counterIntakes, parcels, projectParties, projects, users } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { getVersion } from '@/features/config/store'
import { previewFees } from '@/features/fees/preview'
import type { FormBody } from '@/features/forms/formSchema'
import { displayIdsFor } from '@/features/parcels/displayId'

export interface CounterIntakeView {
  applicationId: string
  number: string
  state: CoreState
  typeLabel: string
  payTiming: ApplicationTypeBody['payTiming']
  form: FormBody
  values: Record<string, unknown>
  attestationText: string
  parcelLabel: string
  applicant: { name: string; email: string | null; hasAccount: boolean }
  takenByName: string
  takenAt: Date
  feeEstimateCents: number | null
}

async function intakeRow(db: Db, applicationId: string) {
  const [row] = await db
    .select({
      takenAt: counterIntakes.takenAt,
      takenByName: users.displayName,
      applicantName: projectParties.name,
      applicantEmail: projectParties.email,
      applicantUserId: projectParties.userId,
      parcelId: projects.parcelId,
      siteAddress: parcels.siteAddress,
    })
    .from(counterIntakes)
    .innerJoin(projectParties, eq(projectParties.id, counterIntakes.applicantPartyId))
    .innerJoin(projects, eq(projects.id, projectParties.projectId))
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .leftJoin(users, eq(users.id, counterIntakes.takenBy))
    .where(eq(counterIntakes.applicationId, applicationId))
  return row ?? null
}

export async function isCounterIntake(db: Db, applicationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: counterIntakes.applicationId })
    .from(counterIntakes)
    .where(eq(counterIntakes.applicationId, applicationId))
  return rows.length > 0
}

export async function loadCounterIntake(
  db: Db,
  applicationId: string,
  signal: AbortSignal,
): Promise<CounterIntakeView | null> {
  const [row, app] = await Promise.all([
    intakeRow(db, applicationId),
    loadApplicationContext(db, applicationId, signal),
  ])
  if (row === null || app === null) return null
  const [form, display, preview] = await Promise.all([
    getVersion(db, app.pins.form, signal),
    displayIdsFor(db, [row.parcelId]),
    previewFees(db, app, signal),
  ])
  if (form === null) return null
  return {
    applicationId,
    number: app.number,
    state: app.state,
    typeLabel: app.typeBody.label,
    payTiming: app.typeBody.payTiming,
    form: form.body as FormBody,
    values: app.values,
    attestationText: app.typeBody.attestationText,
    parcelLabel: [display.get(row.parcelId), row.siteAddress].filter(Boolean).join(', '),
    applicant: {
      name: row.applicantName,
      email: row.applicantEmail,
      hasAccount: row.applicantUserId !== null,
    },
    takenByName: row.takenByName ?? 'Former user',
    takenAt: row.takenAt,
    feeEstimateCents: preview?.complete === true ? preview.totalCents : null,
  }
}

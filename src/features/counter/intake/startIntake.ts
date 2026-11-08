import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { counterIntakes, parcels } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { createApplication } from '@/features/applications/createApplication'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { getPublished } from '@/features/config/store'
import { mayUseCounter } from '@/features/counter/counterAccess'
import { counterTitle } from '@/features/counter/counterApplication'
import {
  type ApplicantAccount,
  findApplicantAccount,
} from '@/features/counter/intake/applicantAccount'
import { addParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { err, ok, type Result } from '@/types/result'

export interface StartIntakeInput {
  parcelId: string
  applicationTypeKey: string
  applicant: { name: string; email?: string }
  now?: Date
}

export type StartIntakeError =
  | 'forbidden'
  | 'name_required'
  | 'unknown_parcel'
  | 'retired_parcel'
  | 'not_published'
  | 'config_inconsistent'

export interface StartedIntake {
  applicationId: string
  number: string
}

interface ApplicantParty {
  name: string
  email?: string
  userId?: string
}

function applicantParty(
  applicant: StartIntakeInput['applicant'],
  account: ApplicantAccount | null,
): ApplicantParty | null {
  const name = applicant.name.trim()
  if (account !== null) {
    return { name: name === '' ? account.name : name, email: account.email, userId: account.userId }
  }
  if (name === '') return null
  const email = applicant.email?.trim()
  return email === undefined || email === '' ? { name } : { name, email }
}

async function parcelProblem(
  tx: Tx,
  parcelId: string,
): Promise<'unknown_parcel' | 'retired_parcel' | null> {
  const [parcel] = await tx
    .select({ status: parcels.status })
    .from(parcels)
    .where(eq(parcels.id, parcelId))
  if (parcel === undefined) return 'unknown_parcel'
  return parcel.status === 'retired' ? 'retired_parcel' : null
}

async function createIntake(
  tx: Tx,
  actor: Actor,
  context: { input: StartIntakeInput; label: string; party: ApplicantParty; now: Date },
  signal: AbortSignal,
): Promise<Result<StartedIntake, StartIntakeError>> {
  const { input, label, party, now } = context
  const problem = await parcelProblem(tx, input.parcelId)
  if (problem !== null) return err(problem)
  const title = await counterTitle(tx, label, input.parcelId)
  const project = await createProject(tx, actor, { parcelId: input.parcelId, title }, signal)
  if (!project.ok) return err(project.error)
  const projectId = project.value.projectId
  const added = await addParty(tx, actor, { projectId, role: 'applicant', ...party }, signal)
  if (!added.ok) return err('forbidden')
  const created = await createApplication(
    tx,
    actor,
    { projectId, applicationTypeKey: input.applicationTypeKey },
    signal,
    now,
  )
  if (!created.ok) return err(created.error)
  const { applicationId } = created.value
  await tx.insert(counterIntakes).values({
    applicationId,
    applicantPartyId: added.value.partyId,
    takenBy: actor.userId,
    takenAt: now,
  })
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'application.counter_intake',
      entityType: 'application',
      entityId: applicationId,
      after: { applicantPartyId: added.value.partyId, linkedAccount: party.userId !== undefined },
    },
    signal,
  )
  return ok(created.value)
}

export async function startCounterIntake(
  db: Db,
  actor: Actor,
  input: StartIntakeInput,
  signal: AbortSignal,
): Promise<Result<StartedIntake, StartIntakeError>> {
  const now = input.now ?? new Date()
  signal.throwIfAborted()
  if (!(await mayUseCounter(db, actor, signal))) return err('forbidden')
  const type = await getPublished(db, 'application_type', input.applicationTypeKey, signal)
  if (type === null) return err('not_published')
  const account = await findApplicantAccount(db, input.applicant.email ?? '', signal)
  const party = applicantParty(input.applicant, account)
  if (party === null) return err('name_required')
  const label = (type.body as ApplicationTypeBody).label
  return await transactionResult<StartedIntake, StartIntakeError>(db, (tx) =>
    createIntake(tx, actor, { input, label, party, now }, signal),
  )
}

import { NH_STARTERS } from '@packs/nh/starters'
import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { applications, projects, users } from '@/db/schema'
import { createApplication } from '@/features/applications/createApplication'
import type { CoreState } from '@/features/applications/states'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import { type Actor, loadActor } from '@/features/auth/actor'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { markComplete } from '@/features/building/completeness'
import { recordRegionalImpactDetermination } from '@/features/building/regionalImpact'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { feeBalance } from '@/features/ledger/feeBalance'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { createProject } from '@/features/projects/projects'
import { assignReviewer, signOffReview } from '@/features/reviews/assignments'
import type { CivilDate } from '@/types/civilDate'

export const TITLE_PREFIX = 'Demo permit:'

export interface Cast {
  admin: Actor
  staff: Actor
  applicant: Actor
}

export const d = (s: string) => s as CivilDate
export const noon = (s: string) => new Date(`${s}T17:00:00Z`)

export async function actorFor(db: Db, local: string, signal: AbortSignal): Promise<Actor> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, `${local}@${DEMO_DOMAIN}`))
  const actor = row === undefined ? null : await loadActor(db, row.id, signal)
  if (actor === null) throw new AppError(ErrorIds.DB_INVARIANT, 'Demo user missing', { local })
  return actor
}

export function must<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
  what: string,
): T {
  if (!result.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `Demo seed step failed: ${what}`, {
      error: JSON.stringify(result.error),
    })
  return result.value
}

export const BUILDING_VALUES = {
  work_type: 'building',
  description: 'Two-story addition with an attached garage',
  classification: 'residential',
  dwelling_units: 1,
  finished_sq_ft: '1800',
  unfinished_sq_ft: '400',
  estimated_cost: '185000.00',
}

export const TRADE_VALUES = {
  description: 'Replace the main panel and service entrance',
  contractor_license_number: 'EL-20418',
  service_amps: 200,
}

export class Scenario {
  constructor(
    readonly db: Db,
    readonly cast: Cast,
    readonly signal: AbortSignal,
    readonly applicationId: string,
  ) {}

  async step(to: CoreState, on: string, actor: Actor = this.cast.staff): Promise<void> {
    if (to === 'issued') await this.payFeesInCash(on)
    const [row] = await this.db
      .select()
      .from(applications)
      .where(eq(applications.id, this.applicationId))
    const moved = await this.db.transaction((tx) =>
      transitionApplication(
        tx,
        actor,
        {
          applicationId: this.applicationId,
          to,
          expectedRowVersion: row?.rowVersion ?? 0,
          onDate: d(on),
        },
        this.signal,
        noon(on),
      ),
    )
    must(moved, `move to ${to}`)
  }

  private async payFeesInCash(on: string): Promise<void> {
    const balance = await feeBalance(this.db, this.applicationId, this.signal)
    const allocations = balance.lines
      .filter((l) => l.dueCents > 0)
      .map((l) => ({
        targetKind: 'fee_assessment_line' as const,
        applicationId: this.applicationId,
        feeAssessmentId: l.feeAssessmentId,
        stage: l.stage,
        feeCode: l.feeCode,
        amountCents: l.dueCents,
      }))
    if (allocations.length === 0) return
    const posted = await recordCounterPayment(
      this.db,
      this.cast.staff,
      {
        method: 'cash',
        amountCents: balance.dueCents,
        payerName: 'Demo payer',
        allocations,
      },
      this.signal,
      noon(on),
    )
    must(posted, 'demo payment')
  }
}

export async function findApplication(db: Db, title: string): Promise<string | null> {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(projects.title, `${TITLE_PREFIX} ${title}`))
    .limit(1)
  return row?.id ?? null
}

export async function open(
  db: Db,
  cast: Cast,
  signal: AbortSignal,
  input: {
    parcel: string
    title: string
    typeKey: string
    values: Record<string, unknown>
    submittedOn: string
  },
): Promise<Scenario> {
  const parcel = must(await resolveParcelId(db, { value: input.parcel }, signal), 'parcel')
  const project = must(
    await createProject(
      db,
      cast.applicant,
      { parcelId: parcel.parcelId, title: `${TITLE_PREFIX} ${input.title}` },
      signal,
    ),
    'project',
  )
  const created = must(
    await createApplication(
      db,
      cast.applicant,
      { projectId: project.projectId, applicationTypeKey: input.typeKey },
      signal,
      noon(input.submittedOn),
    ),
    'application',
  )
  const type = NH_STARTERS.find((s) => s.applicationType.key === input.typeKey)
  must(
    await submitApplication(
      db,
      cast.applicant,
      {
        applicationId: created.applicationId,
        values: input.values,
        attestation: {
          statementSha256: attestationHash(type?.applicationType.attestationText ?? ''),
        },
      },
      signal,
      noon(input.submittedOn),
    ),
    'submit',
  )
  return new Scenario(db, cast, signal, created.applicationId)
}

export async function completeAndReview(
  s: Scenario,
  completedOn: string,
  reviewOn: string,
): Promise<void> {
  must(
    await markComplete(
      s.db,
      s.cast.staff,
      { applicationId: s.applicationId, completedDate: d(completedOn) },
      s.signal,
      noon(reviewOn),
    ),
    'complete',
  )
  await s.step('under_review', reviewOn)
}

async function signedOffReview(s: Scenario): Promise<void> {
  const reviewer = await actorFor(s.db, 'reviewer', s.signal)
  const assigned = must(
    await assignReviewer(
      s.db,
      s.cast.staff,
      { applicationId: s.applicationId, reviewerUserId: reviewer.userId },
      s.signal,
    ),
    'review assignment',
  )
  must(
    await signOffReview(s.db, reviewer, { assignmentId: assigned.assignmentId }, s.signal),
    'review sign-off',
  )
}

export async function readyToIssue(s: Scenario, decidedOn: string): Promise<void> {
  await signedOffReview(s)
  await s.step('decided', decidedOn)
  must(
    await recordCodeEdition(s.db, s.cast.staff, { applicationId: s.applicationId }, s.signal),
    'code edition',
  )
  must(
    await recordRegionalImpactDetermination(
      s.db,
      s.cast.staff,
      { applicationId: s.applicationId, determination: 'no', determinedOn: d(decidedOn) },
      s.signal,
    ),
    'regional impact',
  )
}

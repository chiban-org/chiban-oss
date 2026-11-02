import { NH_STARTERS } from '@packs/nh/starters'
import { eq, like } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { applications, projects, users } from '@/db/schema'
import { recordAppeal } from '@/features/appeals/appeals'
import { createApplication } from '@/features/applications/createApplication'
import type { CoreState } from '@/features/applications/states'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import { type Actor, loadActor } from '@/features/auth/actor'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { markComplete } from '@/features/building/completeness'
import {
  recordRegionalImpactDetermination,
  recordRegionalImpactNotice,
} from '@/features/building/regionalImpact'
import { renewPermit } from '@/features/building/renewal'
import { adoptStarter } from '@/features/config/adoptStarter'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { createFeeOverride } from '@/features/fees/feeOverrides'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { createProject } from '@/features/projects/projects'
import type { CivilDate } from '@/types/civilDate'

const TITLE_PREFIX = 'Demo permit:'

interface Cast {
  admin: Actor
  staff: Actor
  applicant: Actor
}

const d = (s: string) => s as CivilDate
const noon = (s: string) => new Date(`${s}T17:00:00Z`)

async function actorFor(db: Db, local: string, signal: AbortSignal): Promise<Actor> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, `${local}@${DEMO_DOMAIN}`))
  const actor = row === undefined ? null : await loadActor(db, row.id, signal)
  if (actor === null) throw new AppError(ErrorIds.DB_INVARIANT, 'Demo user missing', { local })
  return actor
}

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, what: string): T {
  if (!result.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `Demo seed step failed: ${what}`, {
      error: JSON.stringify(result.error),
    })
  return result.value
}

const BUILDING_VALUES = {
  work_type: 'building',
  description: 'Two-story addition with an attached garage',
  classification: 'residential',
  dwelling_units: 1,
  finished_sq_ft: '1800',
  unfinished_sq_ft: '400',
  estimated_cost: '185000.00',
}

const TRADE_VALUES = {
  description: 'Replace the main panel and service entrance',
  contractor_license_number: 'EL-20418',
  service_amps: 200,
}

class Scenario {
  constructor(
    readonly db: Db,
    readonly cast: Cast,
    readonly signal: AbortSignal,
    readonly applicationId: string,
  ) {}

  async step(to: CoreState, on: string, actor: Actor = this.cast.staff): Promise<void> {
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
}

async function open(
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

async function completeAndReview(
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

async function readyToIssue(s: Scenario, decidedOn: string): Promise<void> {
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

export async function seedPermits(db: Db, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(like(projects.title, `${TITLE_PREFIX}%`))
    .limit(1)
  if (existing.length > 0) return false
  const cast: Cast = {
    admin: await actorFor(db, 'admin', signal),
    staff: await actorFor(db, 'staff', signal),
    applicant: await actorFor(db, 'applicant', signal),
  }
  for (const starter of NH_STARTERS) {
    const adopted = await adoptStarter(db, cast.admin, starter.id, signal)
    if (!adopted.ok && adopted.error !== 'already_adopted') must(adopted, `adopt ${starter.id}`)
  }

  const inReview = await open(db, cast, signal, {
    parcel: '007001000000',
    title: 'Addition under review',
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: '2027-05-10',
  })
  await completeAndReview(inReview, '2027-05-12', '2027-05-13')
  must(
    await createFeeOverride(
      db,
      cast.admin,
      {
        applicationId: inReview.applicationId,
        feeCode: 'building',
        kind: 'waive',
        reason: 'Fee waived for a town-sponsored project',
      },
      signal,
    ),
    'fee waiver',
  )

  const regional = await open(db, cast, signal, {
    parcel: '007002000000',
    title: 'Lodge with regional impact',
    typeKey: 'BP',
    values: { ...BUILDING_VALUES, classification: 'nonresidential', commercial_sq_ft: '5200' },
    submittedOn: '2027-05-20',
  })
  await completeAndReview(regional, '2027-05-21', '2027-05-22')
  must(
    await recordRegionalImpactDetermination(
      db,
      cast.staff,
      {
        applicationId: regional.applicationId,
        determination: 'yes',
        determinedOn: d('2027-05-25'),
      },
      signal,
    ),
    'determination',
  )
  must(
    await recordRegionalImpactNotice(
      db,
      cast.staff,
      {
        applicationId: regional.applicationId,
        recipientKind: 'regional_planning_commission',
        recipientName: 'Alder Pond Regional Planning Commission',
        method: 'certified_mail',
        mailedOn: d('2027-05-26'),
        reference: 'CM-0042',
      },
      signal,
    ),
    'notice',
  )

  const trade = await open(db, cast, signal, {
    parcel: '007003000000',
    title: 'Service upgrade',
    typeKey: 'EL',
    values: TRADE_VALUES,
    submittedOn: '2027-05-15',
  })
  await trade.step('issued', '2027-05-15')

  const appealed = await open(db, cast, signal, {
    parcel: '007004000000',
    title: 'Barn conversion under appeal',
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: '2027-03-01',
  })
  await completeAndReview(appealed, '2027-03-02', '2027-03-03')
  await readyToIssue(appealed, '2027-03-20')
  await appealed.step('issued', '2027-04-01')
  must(
    await recordAppeal(
      db,
      cast.staff,
      {
        applicationId: appealed.applicationId,
        filedOn: d('2027-05-01'),
        appellantName: 'Abutter at 12 Pond Road',
      },
      signal,
    ),
    'appeal',
  )

  const renewed = await open(db, cast, signal, {
    parcel: '007006000000',
    title: 'Deck renewed once',
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: '2026-05-20',
  })
  await completeAndReview(renewed, '2026-05-21', '2026-05-22')
  await readyToIssue(renewed, '2026-06-05')
  await renewed.step('issued', '2026-06-10')
  must(
    await renewPermit(
      db,
      cast.staff,
      { applicationId: renewed.applicationId, renewedOn: d('2027-05-28') },
      signal,
    ),
    'renewal',
  )
  return true
}

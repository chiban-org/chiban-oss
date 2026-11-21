import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, developmentHolds } from '@/db/schema'
import { addApplicantParcel } from '@/features/abutters/applicantParcels'
import { createApplication } from '@/features/applications/createApplication'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { importCutoverCsv } from '@/features/cutover/importCutover'
import { activeHoldFor, recordCivilAction } from '@/features/enforcement/developmentHolds'
import { issueApplication } from '@/features/issuance/issueApplication'
import { setActivePackForTest } from '@/features/packs/registry'
import { startApplication } from '@/features/portal/drafts'
import { createProject } from '@/features/projects/projects'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { CURE_NOW } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  HOLD_COURT,
  HOLD_LAPSED,
  HOLD_NOW,
  HOLD_TYPE,
  type HoldHelpers,
  type HoldWorld,
  holdHelpers,
  setupHoldWorld,
} from '@/test/holdFixtures'
import { XX_CURE } from '@/test/packs/xx/cure'
import { makeParcel } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: HoldWorld
let hold: HoldHelpers

beforeEach(async () => {
  handle = await makeTestDb()
  const permit = await setupPermitWorld(handle.db)
  setActivePackForTest(XX_CURE)
  world = await setupHoldWorld(handle.db, permit)
  hold = holdHelpers(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('placing a development hold', () => {
  it('is refused while the cure period is still running', async () => {
    const { caseId } = await hold.noticedCase()
    expect(await hold.place(caseId, d('2027-03-11'))).toEqual({
      ok: false,
      error: 'cure_not_lapsed',
    })
    expect(await handle.db.select().from(developmentHolds)).toHaveLength(0)
  })

  it('is refused for a case with no parcel', async () => {
    const { caseId } = await hold.noticedCase(null)
    expect(await hold.place(caseId)).toEqual({ ok: false, error: 'no_parcel' })
  })

  it('holds the parcel once the cure period ran with the violation uncorrected', async () => {
    const { caseId } = await hold.noticedCase()
    const placed = await hold.place(caseId)
    if (!placed.ok) throw new Error(placed.error)
    expect(await activeHoldFor(handle.db, world.permit.parcelId, signal)).toEqual({
      holdId: placed.value.holdId,
      caseId,
    })
    expect(await hold.place(caseId)).toEqual({ ok: false, error: 'already_held' })
  })

  it('stops offering the hold as a remedy once it is placed', async () => {
    const { caseId } = await hold.noticedCase()
    const before = await world.cure.planOn(caseId, HOLD_LAPSED)
    expect(before.remedies.map((a) => a.kind)).toContain('place_hold')
    await hold.place(caseId)
    const after = await world.cure.planOn(caseId, HOLD_LAPSED)
    expect(after.remedies.map((a) => a.kind)).not.toContain('place_hold')
  })
})

describe('intake on a held parcel', () => {
  it('refuses portal start, counter start and a new application', async () => {
    await hold.heldCase()
    const { parcelId } = world.permit
    const portal = await startApplication(
      handle.db,
      world.permit.applicant,
      { parcelId, applicationTypeKey: HOLD_TYPE },
      signal,
      HOLD_NOW,
    )
    expect(portal).toEqual({ ok: false, error: 'parcel_held' })
    const counter = await startCounterIntake(
      handle.db,
      world.permit.staff,
      {
        parcelId,
        applicationTypeKey: HOLD_TYPE,
        applicant: { name: 'Robin Renter' },
        now: HOLD_NOW,
      },
      signal,
    )
    expect(counter).toEqual({ ok: false, error: 'parcel_held' })
    const created = await createApplication(
      handle.db,
      world.permit.applicant,
      { projectId: world.permit.projectId, applicationTypeKey: HOLD_TYPE },
      signal,
      HOLD_NOW,
    )
    expect(created).toEqual({ ok: false, error: 'parcel_held' })
  })

  it('refuses to submit a draft started before the hold', async () => {
    const draft = await makeApplication(handle.db, world.permit, {}, CURE_NOW, HOLD_TYPE)
    await hold.heldCase()
    const submitted = await submitApplication(
      handle.db,
      world.permit.applicant,
      {
        applicationId: draft.applicationId,
        values: {},
        attestation: { statementSha256: attestationHash('') },
      },
      signal,
      HOLD_NOW,
    )
    expect(submitted).toEqual({ ok: false, error: 'parcel_held' })
  })

  it('refuses to add the held parcel to another application', async () => {
    await hold.heldCase()
    const elsewhere = await makeParcel(handle.db, [{ format: 'gis12', value: '007002000000' }])
    const project = await createProject(
      handle.db,
      world.permit.applicant,
      { parcelId: elsewhere, title: 'Boathouse' },
      signal,
    )
    if (!project.ok) throw new Error(project.error)
    const made = await createApplication(
      handle.db,
      world.permit.applicant,
      { projectId: project.value.projectId, applicationTypeKey: HOLD_TYPE },
      signal,
      HOLD_NOW,
    )
    if (!made.ok) throw new Error(made.error)
    const added = await addApplicantParcel(
      handle.db,
      world.permit.staff,
      { applicationId: made.value.applicationId, parcelId: world.permit.parcelId },
      signal,
    )
    expect(added).toEqual({ ok: false, error: 'parcel_held' })
  })

  it('refuses to issue an application that was under review when the hold was placed', async () => {
    const app = await makeApplication(
      handle.db,
      world.permit,
      { state: 'decided', decidedOn: '2027-03-04' },
      CURE_NOW,
      HOLD_TYPE,
    )
    await hold.heldCase()
    const issued = await issueApplication(
      handle.db,
      world.permit.staff,
      { applicationId: app.applicationId },
      signal,
      { now: HOLD_NOW },
    )
    expect(issued).toEqual({ ok: false, error: 'parcel_held' })
  })

  it('still carries a cutover import on the held parcel through to issued', async () => {
    await hold.heldCase()
    const header = [
      'legacy_number',
      'application_type_key',
      'parcel_id_format',
      'parcel_id',
      'project_title',
      'applicant_name',
      'state',
      'received_date',
      'completed_date',
      'decided_on',
      'issued_on',
      'field.work_type',
      'field.description',
      'field.classification',
      'field.dwelling_units',
    ]
    const row = [
      'L-HOLD',
      HOLD_TYPE,
      'gis12',
      '007001000000',
      'Garage',
      'Pat Applicant',
      'issued',
      '2027-02-01',
      '2027-02-03',
      '2027-02-08',
      '2027-02-10',
      'building',
      'Two car garage',
      'residential',
      '1',
    ]
    const bytes = new TextEncoder().encode(
      [header.join(','), row.map((v) => `"${v}"`).join(',')].join('\n'),
    )
    const report = await importCutoverCsv(
      handle.db,
      world.permit.staff,
      { bytes, dryRun: false, now: HOLD_NOW },
      signal,
    )
    if (!report.ok) throw new Error(report.error)
    expect(report.value.rows[0]?.errors).toEqual([])
    const [app] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.number, report.value.rows[0]?.applicationNumber ?? ''))
    expect(app?.state).toBe('issued')
  })
})

describe('a civil action', () => {
  it('is refused before the cure period runs out and recorded after it', async () => {
    const { caseId } = await hold.noticedCase()
    const early = await recordCivilAction(
      handle.db,
      world.permit.staff,
      { caseId, filedOn: d('2027-03-11'), court: HOLD_COURT, docket: null },
      signal,
    )
    expect(early).toEqual({ ok: false, error: 'cure_not_lapsed' })
    const filed = await recordCivilAction(
      handle.db,
      world.permit.staff,
      { caseId, filedOn: HOLD_LAPSED, court: HOLD_COURT, docket: 'VD-2027-0042' },
      signal,
    )
    expect(filed.ok).toBe(true)
    const plan = await world.cure.planOn(caseId, HOLD_LAPSED)
    expect(plan.remedies.map((a) => a.kind)).not.toContain('file_civil_action')
  })
})

describe('under the New Hampshire pack', () => {
  it('never holds a parcel', async () => {
    const { caseId } = await hold.noticedCase()
    setActivePackForTest(null)
    expect(await hold.place(caseId)).toEqual({ ok: false, error: 'remedy_not_available' })
    await handle.db.insert(developmentHolds).values({
      parcelId: world.permit.parcelId,
      caseId,
      placedOn: HOLD_LAPSED,
      placedBy: world.permit.staff.userId,
    })
    expect(await activeHoldFor(handle.db, world.permit.parcelId, signal)).toBeNull()
    const created = await createApplication(
      handle.db,
      world.permit.applicant,
      { projectId: world.permit.projectId, applicationTypeKey: 'BP' },
      signal,
      HOLD_NOW,
    )
    expect(created.ok).toBe(true)
  })
})

import { NH_INSPECTION_SETTINGS_DEFAULT } from '@packs/nh/starters'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordAppeal } from '@/features/appeals/appeals'
import { loadActor } from '@/features/auth/actor'
import { publishConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import { inspectableTypes } from '@/features/inspections/eligibility'
import { describeIntakeBlock, reinspectableFailureIds } from '@/features/inspections/lookup'
import { requestInspection } from '@/features/inspections/requestInspection'
import { listVisibleInspections } from '@/features/inspections/visibility'
import { makeApplication } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import {
  addUnclaimedContractor,
  checklistIdFor,
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const deps = { now: INSPECTION_NOW }
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function request(
  actor: Parameters<typeof requestInspection>[1],
  applicationId: string,
  type: string,
  patch: Partial<Parameters<typeof requestInspection>[2]> = {},
  channel: 'phone' | 'portal' = 'phone',
) {
  return await requestInspection(
    handle.db,
    actor,
    {
      applicationId,
      checklistVersionId: await checklistIdFor(handle.db, applicationId, type),
      channel,
      contactName: 'Pat Contact',
      ...patch,
    },
    signal,
    deps,
  )
}

describe('inspection requests', () => {
  it('staff phone request on an issued electrical permit is requested', async () => {
    const r = await request(w.world.staff, w.trade.applicationId, 'rough')
    expect(r.ok).toBe(true)
  })

  it('request on a submitted building permit is not_issued', async () => {
    const made = await makeApplication(
      handle.db,
      w.world,
      { state: 'submitted' },
      INSPECTION_NOW,
      'BP',
    )
    const r = await request(w.world.staff, made.applicationId, 'footing')
    expect(r).toEqual({ ok: false, error: 'not_issued' })
  })

  it('request on a suspended permit is permit_suspended', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const appeal = await recordAppeal(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        filedOn: civil('2027-06-30'),
        appellantName: 'Neighbor',
      },
      signal,
    )
    expect(appeal.ok).toBe(true)
    const r = await request(w.world.staff, permit.applicationId, 'footing')
    expect(r).toEqual({ ok: false, error: 'permit_suspended' })
  })

  it('portal request by the applicant party succeeds; by another applicant is not_found', async () => {
    const ok = await request(w.world.applicant, w.trade.applicationId, 'final', {}, 'portal')
    expect(ok.ok).toBe(true)
    const other = await request(w.stranger, w.trade.applicationId, 'final', {}, 'portal')
    expect(other).toEqual({ ok: false, error: 'not_found' })
  })

  it('unclaimed contractor email party gets not_found', async () => {
    const userId = await makeUser(handle.db, {
      role: 'contractor',
      email: 'unclaimed@alderpond.example',
    })
    const actor = await loadActor(handle.db, userId, signal)
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    await addUnclaimedContractor(handle.db, w.world.projectId, 'unclaimed@alderpond.example')
    const r = await request(actor ?? w.stranger, permit.applicationId, 'rough', {}, 'portal')
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })

  it('portal request when portalRequestsEnabled is false is portal_requests_disabled', async () => {
    const admin = w.world.admin
    const saved = await saveDraft(
      handle.db,
      admin,
      {
        kind: 'inspection_settings',
        key: 'default',
        body: { ...NH_INSPECTION_SETTINGS_DEFAULT, portalRequestsEnabled: false },
      },
      signal,
    )
    if (!saved.ok) throw new Error('draft failed')
    await publishConfig(handle.db, admin, saved.value.versionId, signal)
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const r = await request(w.world.applicant, permit.applicationId, 'rough', {}, 'portal')
    const staffOk = await request(w.world.staff, permit.applicationId, 'rough')
    const reenable = await saveDraft(
      handle.db,
      admin,
      { kind: 'inspection_settings', key: 'default', body: NH_INSPECTION_SETTINGS_DEFAULT },
      signal,
    )
    if (!reenable.ok) throw new Error('draft failed')
    await publishConfig(handle.db, admin, reenable.value.versionId, signal)
    expect(r).toEqual({ ok: false, error: 'portal_requests_disabled' })
    expect(staffOk.ok).toBe(true)
  })

  it('checklist version not in the pins is not_a_pinned_checklist', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const foreign = await checklistIdFor(handle.db, w.building.applicationId, 'footing')
    const r = await requestInspection(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        checklistVersionId: foreign,
        channel: 'counter',
        contactName: 'Pat',
      },
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'not_a_pinned_checklist' })
  })

  it('reinspection of a passed inspection is reinspection_not_failed', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const passed = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'passed',
    })
    const r = await request(w.world.staff, permit.applicationId, 'rough', {
      reinspectionOf: passed,
    })
    expect(r).toEqual({ ok: false, error: 'reinspection_not_failed' })
  })

  it('a failed inspection allows one reinspection and a second open one is reinspection_open', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const failed = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
    })
    const first = await request(w.world.staff, permit.applicationId, 'rough', {
      reinspectionOf: failed,
    })
    const second = await request(w.world.staff, permit.applicationId, 'rough', {
      reinspectionOf: failed,
    })
    expect(first.ok).toBe(true)
    expect(second).toEqual({ ok: false, error: 'reinspection_open' })
  })

  it('a failure that already has a passed reinspection is reinspection_exists', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const failed = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
    })
    await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'passed',
      reinspectionOf: failed,
    })
    const r = await request(w.world.staff, permit.applicationId, 'rough', {
      reinspectionOf: failed,
    })
    expect(r).toEqual({ ok: false, error: 'reinspection_exists' })
  })

  it('a reinspection of an older failure is reinspection_superseded when a newer failure exists', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const older = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
      requestedAt: new Date('2027-06-01T12:00:00Z'),
    })
    const newer = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
      requestedAt: new Date('2027-06-20T12:00:00Z'),
    })
    const stale = await request(w.world.staff, permit.applicationId, 'rough', {
      reinspectionOf: older,
    })
    const latest = await request(
      w.world.applicant,
      permit.applicationId,
      'rough',
      {
        reinspectionOf: newer,
      },
      'portal',
    )
    expect(stale).toEqual({ ok: false, error: 'reinspection_superseded' })
    expect(latest.ok).toBe(true)
  })

  it('a cancelled reinspection does not block a new one', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const failed = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
    })
    await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'cancelled',
      reinspectionOf: failed,
    })
    const r = await request(w.world.staff, permit.applicationId, 'rough', {
      reinspectionOf: failed,
    })
    expect(r.ok).toBe(true)
  })

  it('the reinspectable failures are only the latest failure per type without a follow-up', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const first = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
      requestedAt: new Date('2027-06-01T12:00:00Z'),
    })
    await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'passed',
      reinspectionOf: first,
      requestedAt: new Date('2027-06-05T12:00:00Z'),
    })
    const second = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
      requestedAt: new Date('2027-06-20T12:00:00Z'),
    })
    const ids = await reinspectableFailureIds(handle.db, permit.applicationId)
    expect([...ids]).toEqual([second])
  })

  it('the intake copy for a suspended permit is the appeal copy, not not-issued', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await recordAppeal(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        filedOn: civil('2027-06-30'),
        appellantName: 'Neighbor',
      },
      signal,
    )
    const copy = await describeIntakeBlock(
      handle.db,
      { id: permit.applicationId, number: 'BP-1', state: 'issued' },
      signal,
    )
    expect(copy).toBe('Inspections are paused while this permit is under appeal.')
    const other = await describeIntakeBlock(
      handle.db,
      { id: w.trade.applicationId, number: 'BP-2', state: 'submitted' },
      signal,
    )
    expect(other).toBe('BP-2 is not issued, so it cannot be inspected yet.')
  })

  it('preferred date on a Tuesday is preferred_date_unavailable', async () => {
    const r = await request(w.world.staff, w.trade.applicationId, 'rough', {
      preferredDate: civil('2027-07-06'),
    })
    expect(r).toEqual({ ok: false, error: 'preferred_date_unavailable' })
  })

  it('preferred date on a Wednesday inside the horizon is accepted', async () => {
    const r = await request(w.world.staff, w.trade.applicationId, 'rough', {
      preferredDate: civil('2027-07-07'),
    })
    expect(r.ok).toBe(true)
  })

  it('reviewer requesting is forbidden', async () => {
    const r = await request(w.world.reviewer, w.trade.applicationId, 'rough')
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('inspectable types list the pinned checklists with the final flag', async () => {
    const types = await inspectableTypes(handle.db, w.building.applicationId, signal)
    expect(types.map((t) => t.inspectionType)).toEqual([
      'footing',
      'foundation',
      'framing',
      'insulation',
      'final',
    ])
    expect(types.filter((t) => t.final)).toHaveLength(1)
  })
})

describe('inspection visibility', () => {
  it('applicant sees 2 of 30 inspections with limit 25', async () => {
    const mine = await newIssuedPermit(handle.db, w, 'EL')
    await insertInspection(handle.db, mine.applicationId, 'rough')
    await insertInspection(handle.db, mine.applicationId, 'final')
    const foreign = await insertForeignProject()
    for (let i = 0; i < 28; i += 1) await insertInspection(handle.db, foreign, 'rough')
    const rows = await listVisibleInspections(handle.db, w.stranger, { limit: 25 }, signal)
    expect(rows).toHaveLength(0)
    const visible = await listVisibleInspections(
      handle.db,
      w.world.applicant,
      { limit: 25 },
      signal,
    )
    const mineOnly = visible.filter((r) => r.applicationId === mine.applicationId)
    expect(mineOnly).toHaveLength(2)
    expect(visible.length).toBeLessThan(25)
  })

  it('reviewer sees no inspections', async () => {
    const rows = await listVisibleInspections(handle.db, w.world.reviewer, { limit: 25 }, signal)
    expect(rows).toHaveLength(0)
  })

  it('a signed-out visitor sees no inspections', async () => {
    expect(await listVisibleInspections(handle.db, null, { limit: 25 }, signal)).toHaveLength(0)
  })

  it('inspector and staff see every inspection', async () => {
    const asInspector = await listVisibleInspections(handle.db, w.inspector, { limit: 100 }, signal)
    expect(asInspector.length).toBeGreaterThanOrEqual(30)
  })
})

async function insertForeignProject(): Promise<string> {
  const owner = await staffActor(handle.db, 'applicant')
  const { createProject } = await import('@/features/projects/projects')
  const project = await createProject(
    handle.db,
    owner,
    { parcelId: w.world.parcelId, title: 'Elsewhere' },
    signal,
  )
  if (!project.ok) throw new Error('project failed')
  const made = await makeApplication(
    handle.db,
    { ...w.world, applicant: owner, projectId: project.value.projectId },
    { state: 'issued' },
    INSPECTION_NOW,
    'EL',
  )
  return made.applicationId
}

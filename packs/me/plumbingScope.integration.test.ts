import { ME_STARTERS } from '@packs/me/starters'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecordsData } from '@/app/(staff)/staff/applications/[applicationId]/recordsData'
import { workPanels } from '@/app/(staff)/staff/applications/[applicationId]/workPanels'
import { loadApplicationContext } from '@/features/applications/context'
import { acceptWithoutDocument } from '@/features/applications/documentItems'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { actorMayMove } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { markComplete } from '@/features/building/completeness'
import { adoptStarter } from '@/features/config/adoptStarter'
import { listCounterTypes } from '@/features/counter/directIssueTypes'
import { mayUploadTo } from '@/features/documents/uploadAccess'
import { overrideAdministrativeGate } from '@/features/gates/overrides'
import { setActivePackForTest } from '@/features/packs/registry'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffWith } from '@/test/staffUsers'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const RECEIVED = '2027-03-01' as CivilDate
const COMPLETED = '2027-03-02' as CivilDate
let handle: TestDb
let world: PermitWorld
let plumber: Actor

async function submitted(typeKey: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'submitted', receivedDate: RECEIVED },
    NOW,
    typeKey,
  )
  return made.applicationId
}

async function mayStartReview(actor: Actor, applicationId: string): Promise<boolean> {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing application')
  return await actorMayMove(handle.db, actor, app, 'under_review', signal)
}

function assign(actor: Actor, applicationId: string) {
  return assignReviewer(
    handle.db,
    actor,
    { applicationId, reviewerUserId: world.reviewer.userId },
    signal,
  )
}

function override(actor: Actor, applicationId: string) {
  return overrideAdministrativeGate(
    handle.db,
    actor,
    {
      applicationId,
      gateKey: 'conditions.blocking_met',
      reason: 'Design letter from the site evaluator is on file',
    },
    signal,
  )
}

function complete(actor: Actor, applicationId: string) {
  return markComplete(handle.db, actor, { applicationId, completedDate: COMPLETED }, signal, NOW)
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  for (const starter of ME_STARTERS) {
    const adopted = await adoptStarter(handle.db, world.admin, starter.id, signal)
    expect(adopted.ok ? 'ok' : adopted.error, starter.id).toBe('ok')
  }
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('starting the review on a plumbing permit', () => {
  it('a plumbing inspector starts the review on a subsurface wastewater permit but not on a building permit', async () => {
    expect(await mayStartReview(plumber, await submitted('SSW'))).toBe(true)
    expect(await mayStartReview(plumber, await submitted('BP'))).toBe(false)
  })

  it('land use staff still start the review on a plumbing permit', async () => {
    expect(await mayStartReview(world.staff, await submitted('SSW'))).toBe(true)
  })
})

describe('review controls on a plumbing permit', () => {
  it('a plumbing inspector assigns a reviewer on a subsurface wastewater permit but not on a building permit', async () => {
    expect(await assign(plumber, await submitted('SSW'))).toMatchObject({ ok: true })
    expect(await assign(plumber, await submitted('BP'))).toEqual({ ok: false, error: 'forbidden' })
  })

  it('a plumbing inspector records an override on a subsurface wastewater permit but not on a building permit', async () => {
    expect(await override(plumber, await submitted('SSW'))).toEqual({ ok: true, value: undefined })
    expect(await override(plumber, await submitted('BP'))).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

function mayUpload(actor: Actor, applicationId: string, itemKey: string | null) {
  return mayUploadTo(handle.db, actor, { kind: 'application', id: applicationId, itemKey }, signal)
}

function accept(actor: Actor, applicationId: string, itemKey: string) {
  return acceptWithoutDocument(
    handle.db,
    actor,
    { applicationId, itemKey, reason: 'Seen at the counter.' },
    signal,
  )
}

describe('counter intake documents on a plumbing permit', () => {
  it('a plumbing inspector uploads and accepts the HHE-200 on a subsurface wastewater permit', async () => {
    const ssw = await submitted('SSW')
    expect(await mayUpload(plumber, ssw, 'hhe_200_application')).toBe(true)
    expect(await mayUpload(plumber, ssw, null)).toBe(true)
    expect(await accept(plumber, ssw, 'hhe_200_application')).toEqual({
      ok: true,
      value: undefined,
    })
  })

  it('a plumbing inspector is refused the same on a building permit', async () => {
    const bp = await submitted('BP')
    expect(await mayUpload(plumber, bp, 'construction_drawings')).toBe(false)
    expect(await mayUpload(plumber, bp, null)).toBe(false)
    expect(await accept(plumber, bp, 'construction_drawings')).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('land use staff still upload on a subsurface wastewater permit', async () => {
    const ssw = await submitted('SSW')
    expect(await mayUpload(world.staff, ssw, 'hhe_200_application')).toBe(true)
    expect(await mayUpload(world.staff, ssw, null)).toBe(true)
  })
})

describe('marking a Maine application complete', () => {
  it('a plumbing inspector marks a subsurface wastewater permit complete but not a building permit', async () => {
    expect(await complete(plumber, await submitted('SSW'))).toEqual({ ok: true, value: undefined })
    expect(await complete(plumber, await submitted('BP'))).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('the counter lists by who may issue', () => {
  it('land use staff take an internal plumbing permit for review and the plumbing inspector issues it today', async () => {
    const forStaff = await listCounterTypes(handle.db, signal, world.staff)
    expect(forStaff.takeForReview.map((t) => t.key)).toContain('IP')
    expect(forStaff.issueToday.map((t) => t.key)).not.toContain('IP')
    const forPlumber = await listCounterTypes(handle.db, signal, plumber)
    expect(forPlumber.issueToday.map((t) => t.key)).toContain('IP')
  })
})

describe('marking a New Hampshire building permit complete', () => {
  let nh: TestDb
  let nhWorld: PermitWorld

  beforeAll(async () => {
    setActivePackForTest(null)
    nh = await makeTestDb()
    nhWorld = await setupPermitWorld(nh.db)
  })
  afterAll(async () => {
    await nh.drop()
  })

  it('an inspector who is not land use staff is refused', async () => {
    setActivePackForTest(null)
    const inspector = await staffWith(nh.db, ['inspector'])
    const made = await makeApplication(
      nh.db,
      nhWorld,
      { state: 'submitted', receivedDate: RECEIVED },
      NOW,
    )
    const refused = await markComplete(
      nh.db,
      inspector,
      { applicationId: made.applicationId, completedDate: COMPLETED },
      signal,
      NOW,
    )
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
    const allowed = await markComplete(
      nh.db,
      nhWorld.staff,
      { applicationId: made.applicationId, completedDate: COMPLETED },
      signal,
      NOW,
    )
    expect(allowed).toEqual({ ok: true, value: undefined })
  })

  async function completenessPanel(actor: Actor, applicationId: string): Promise<string> {
    const view = await getStaffApplicationView(nh.db, actor, applicationId, NOW, signal)
    if (view === null) throw new Error('no view')
    const records = await loadRecordsData(
      { db: nh.db, actor, signal },
      applicationId,
      view.projectId,
    )
    const panel = workPanels({
      view,
      records,
      payments: null,
      inspections: {} as never,
      board: null,
      hearings: null,
      notes: { notes: [], activity: [], canAdd: false },
    }).find((p) => p.key === 'completeness')
    return renderToStaticMarkup(panel?.node)
  }

  it('the completeness panel offers Mark complete to land use staff only', async () => {
    setActivePackForTest(null)
    const made = await makeApplication(
      nh.db,
      nhWorld,
      { state: 'submitted', receivedDate: RECEIVED },
      NOW,
    )
    expect(await completenessPanel(nhWorld.staff, made.applicationId)).toContain('Mark complete')
    for (const role of ['inspector', 'finance', 'records_custodian'] as const) {
      const html = await completenessPanel(await staffWith(nh.db, [role]), made.applicationId)
      expect(html, role).toContain('Completeness')
      expect(html, role).not.toContain('Mark complete')
    }
  })
})

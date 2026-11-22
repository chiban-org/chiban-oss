import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, inspections } from '@/db/schema'
import { acceptWithoutDocument } from '@/features/applications/documentItems'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { issueApplication } from '@/features/issuance/issueApplication'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { expireLapsedPermits } from '@/jobs/clocksDaily'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { passingItems, RESULT_NOW, scheduledInspection } from '@/test/inspectionFixtures'
import { makeTestStore } from '@/test/objectStore'
import { staffWith } from '@/test/staffUsers'
import { clockRows } from '@/test/triggerClockFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const AFTER_LAPSE = '2030-01-01' as CivilDate
let handle: TestDb
let world: PermitWorld
let plumber: Actor
let inspector: Actor
let store: ObjectStore

const LAPSING = [
  { prefix: 'SLZ', clock: 'town.slz.expiration', plumbing: false },
  { prefix: 'LU', clock: 'town.permit.expiration', plumbing: false },
  { prefix: 'DEM', clock: 'town.permit.expiration', plumbing: false },
  { prefix: 'SG', clock: 'town.permit.expiration', plumbing: false },
  { prefix: 'SC', clock: 'me.plumbing.validity', plumbing: true },
] as const

async function acceptIssueDocuments(prefix: string, applicationId: string) {
  const starter = ME_STARTERS.find((s) => s.applicationType.prefix === prefix)
  const items = starter?.applicationType.documents ?? []
  for (const item of items.filter((i) => i.stage === 'before_issue')) {
    const done = await acceptWithoutDocument(
      handle.db,
      world.staff,
      { applicationId, itemKey: item.key, reason: 'Seen at the counter.' },
      signal,
    )
    expect(done.ok, item.key).toBe(true)
  }
}

async function stateOf(applicationId: string) {
  const [row] = await handle.db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.state
}

async function clockStatus(applicationId: string, ruleKey: string) {
  return (await clockRows(handle.db, applicationId)).find((c) => c.ruleKey === ruleKey)?.status
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
  inspector = await staffWith(handle.db, ['inspector'])
  store = (await makeTestStore()).store
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function issuedPermit(prefix: string, plumbing: boolean): Promise<string> {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'decided', receivedDate: '2027-02-01', decidedOn: '2027-03-01' },
    NOW,
    prefix,
  )
  await acceptIssueDocuments(prefix, made.applicationId)
  const issued = await issueApplication(
    handle.db,
    plumbing ? plumber : world.staff,
    { applicationId: made.applicationId },
    signal,
    { store, now: NOW },
  )
  expect(issued.ok ? 'ok' : JSON.stringify(issued.error)).toBe('ok')
  return made.applicationId
}

async function recordPassed(applicationId: string, inspector: Actor, inspectionType: string) {
  const id = await scheduledInspection(handle.db, inspector, applicationId, inspectionType, {
    isFinal: inspectionType === 'final',
  })
  const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  const recorded = await recordInspectionResult(
    handle.db,
    inspector,
    {
      inspectionId: id,
      expectedRowVersion: row?.rowVersion ?? 0,
      result: 'passed',
      items: await passingItems(handle.db, applicationId, inspectionType),
    },
    signal,
    { now: RESULT_NOW },
  )
  expect(recorded.ok ? 'ok' : JSON.stringify(recorded.error)).toBe('ok')
}

describe('Maine permits that carry a lapse clock', () => {
  for (const { prefix, clock, plumbing } of LAPSING) {
    it(`a ${prefix} permit stays issued with its lapse clock running, then expires when it lapses`, async () => {
      const applicationId = await issuedPermit(prefix, plumbing)
      expect(await stateOf(applicationId)).toBe('issued')
      expect(await clockStatus(applicationId, clock)).toBe('running')
      await handle.db.transaction((tx) => expireLapsedPermits(tx, AFTER_LAPSE, signal))
      expect(await stateOf(applicationId)).toBe('expired')
      expect(await clockStatus(applicationId, clock)).toBe('lapsed')
    })
  }
})

describe('the start of work and final inspections', () => {
  for (const { prefix, clock, plumbing } of LAPSING.filter((l) =>
    ['SLZ', 'SC'].includes(l.prefix),
  )) {
    it(`start of work meets the ${prefix} lapse clock and leaves the permit issued, and the final inspection closes it`, async () => {
      const applicationId = await issuedPermit(prefix, plumbing)
      const by = plumbing ? plumber : inspector
      await recordPassed(applicationId, by, 'start_of_work')
      expect(await clockStatus(applicationId, clock)).toBe('met')
      expect(await stateOf(applicationId)).toBe('issued')
      await handle.db.transaction((tx) => expireLapsedPermits(tx, AFTER_LAPSE, signal))
      expect(await stateOf(applicationId)).toBe('issued')
      await recordPassed(applicationId, by, 'final')
      expect(await stateOf(applicationId)).toBe('closed')
    })
  }
})

describe('closing a permit by hand before its final inspection', () => {
  for (const { prefix, plumbing } of LAPSING.filter((l) => ['SLZ', 'SC'].includes(l.prefix))) {
    it(`a ${prefix} permit is refused with no final inspection, and closes once one has passed`, async () => {
      const applicationId = await issuedPermit(prefix, plumbing)
      const by = plumbing ? plumber : inspector
      const close = async () => {
        const [row] = await handle.db
          .select()
          .from(applications)
          .where(eq(applications.id, applicationId))
        return await handle.db.transaction((tx) =>
          transitionApplication(
            tx,
            by,
            {
              applicationId,
              to: 'closed',
              expectedRowVersion: row?.rowVersion ?? 0,
            },
            signal,
            NOW,
          ),
        )
      }
      const refused = await close()
      expect(refused.ok).toBe(false)
      const results =
        !refused.ok && typeof refused.error === 'object' && 'gateBlocked' in refused.error
          ? refused.error.gateBlocked
          : []
      expect(results.find((g) => g.key === 'closure.requirement_met')?.outcome).toEqual({
        status: 'blocked',
        reason: 'No final inspection has passed.',
      })
      expect(await stateOf(applicationId)).toBe('issued')
      await recordPassed(applicationId, by, 'final')
      expect(await stateOf(applicationId)).toBe('closed')
    })
  }
})

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, inspections } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { loadApplicationContext } from '@/features/applications/context'
import { actorMayMove } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { startClocksFor } from '@/features/clocks/startClocks'
import { getPublished } from '@/features/config/store'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { setActivePackForTest } from '@/features/packs/registry'
import { expireLapsedPermits } from '@/jobs/clocksDaily'
import { makeApplication } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  INSPECTION_NOW,
  type InspectionWorld,
  passingItems,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffWith } from '@/test/staffUsers'
import { clockRows } from '@/test/triggerClockFixtures'
import type { CivilDate } from '@/types/civilDate'
import { ME_CLASSIFICATIONS } from './classifications'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const ISSUED = d('2027-06-20')
const PAST_LAPSE = d('2029-07-01')
const PLUMBING_TYPE = 'MPL'
const SHORELAND_TYPE = 'MSZ'
let handle: TestDb
let w: InspectionWorld
let plumber: Actor

function bindingsOf(classification: string): string[] {
  return ME_CLASSIFICATIONS.find((c) => c.key === classification)?.mandatoryRuleKeys ?? []
}

async function publishType(typeKey: string, prefix: string, classification: string) {
  const electrical = await getPublished(handle.db, 'application_type', 'EL', signal)
  const body = electrical?.body as ApplicationTypeBody
  await saveAndPublish(handle.db, w.world.admin, 'application_type', typeKey, {
    ...body,
    key: typeKey,
    label: classification,
    prefix,
    classification,
    bindings: bindingsOf(classification),
    workflow: { ...body.workflow, allowsDirectIssue: true },
  })
}

async function issued(typeKey: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    w.world,
    { state: 'issued', issuedOn: ISSUED },
    INSPECTION_NOW,
    typeKey,
  )
  await handle.db.transaction((tx) =>
    startClocksFor(tx, made.applicationId, 'permit_issued', ISSUED, signal),
  )
  return made.applicationId
}

async function mayMove(actor: Actor, applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing application')
  return await actorMayMove(handle.db, actor, app, 'issued', signal)
}

async function recordFirstInspection(applicationId: string) {
  const id = await scheduledInspection(handle.db, plumber, applicationId, 'rough')
  const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  const recorded = await recordInspectionResult(
    handle.db,
    plumber,
    {
      inspectionId: id,
      expectedRowVersion: row?.rowVersion ?? 0,
      result: 'passed',
      items: await passingItems(handle.db, applicationId, 'rough'),
    },
    signal,
    { now: RESULT_NOW },
  )
  expect(recorded.ok).toBe(true)
}

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  setActivePackForTest(ME_PACK)
  await publishType(PLUMBING_TYPE, 'PL', 'me.internal_plumbing')
  await publishType(SHORELAND_TYPE, 'SZ', 'me.shoreland_permit')
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('who may issue a Maine permit', () => {
  it('a code enforcement officer without the plumbing inspector role cannot issue an internal plumbing permit', async () => {
    const applicationId = await issued(PLUMBING_TYPE)
    expect(await mayMove(w.world.staff, applicationId)).toBe(false)
    expect(await mayMove(plumber, applicationId)).toBe(true)
  })

  it('a plumbing inspector cannot issue a shoreland permit', async () => {
    const applicationId = await issued(SHORELAND_TYPE)
    expect(await mayMove(plumber, applicationId)).toBe(false)
    expect(await mayMove(w.world.staff, applicationId)).toBe(true)
  })
})

describe('the 24 month plumbing permit clock', () => {
  it('does not expire an internal plumbing permit whose first inspection was recorded at month 3', async () => {
    const applicationId = await issued(PLUMBING_TYPE)
    await recordFirstInspection(applicationId)
    const clock = (await clockRows(handle.db, applicationId)).find(
      (c) => c.ruleKey === 'me.plumbing.validity',
    )
    expect(clock).toMatchObject({ status: 'met' })
    await handle.db.transaction((tx) => expireLapsedPermits(tx, PAST_LAPSE, signal))
    const [row] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(row?.state).toBe('issued')
  })

  it('expires an internal plumbing permit with no inspection after 24 months', async () => {
    const applicationId = await issued(PLUMBING_TYPE)
    await handle.db.transaction((tx) => expireLapsedPermits(tx, PAST_LAPSE, signal))
    const [row] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(row?.state).toBe('expired')
  })
})

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enforcementCases } from '@/db/schema'
import { setCaseStatus } from '@/features/enforcement/cases'
import { recordCounselOutcome, referToCounsel } from '@/features/enforcement/counsel'
import { releaseDevelopmentHold } from '@/features/enforcement/developmentHolds'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { setActivePackForTest } from '@/features/packs/registry'
import type { PackRule, StatePack } from '@/features/packs/schema'
import type { ObjectStore } from '@/features/storage/objectStore'
import { setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  HOLD_LATER,
  type HoldHelpers,
  type HoldWorld,
  holdHelpers,
  setupHoldWorld,
} from '@/test/holdFixtures'
import { makeTestStore } from '@/test/objectStore'
import { XX_CURE } from '@/test/packs/xx/cure'
import { xxPackWith } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate

const NO_ORDER_CURE_RULES: PackRule[] = XX_CURE.manifest.rules.filter(
  (r) => r.kind !== 'cease_and_desist',
)
const NO_ORDER_CURE: StatePack = xxPackWith({
  roles: { rules: { zoningOrder: null, buildingCodeOrder: null } },
  manifest: { rules: NO_ORDER_CURE_RULES },
  pack: {
    ruleAreas: [{ title: 'All rules', rules: NO_ORDER_CURE_RULES }],
    buildingCodes: {
      choices: [{ key: 'xx.code.a', label: 'Vellmora Code A' }],
      defaultChoice: 'xx.code.a',
      requiredAbove: null,
    },
  },
})

let handle: TestDb
let store: ObjectStore
let world: HoldWorld
let hold: HoldHelpers

async function start(pack: StatePack) {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  const permit = await setupPermitWorld(handle.db)
  setActivePackForTest(pack)
  world = await setupHoldWorld(handle.db, permit)
  hold = holdHelpers(handle.db, world)
}

afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function statusOf(caseId: string) {
  const [row] = await handle.db
    .select({ status: enforcementCases.status, rowVersion: enforcementCases.rowVersion })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
  if (row === undefined) throw new Error('case not found')
  return row
}

async function referAndMove(caseId: string, kind: 'motion_filed' | 'settled') {
  const referred = await referToCounsel(
    handle.db,
    store,
    world.permit.staff,
    { caseId, counselName: 'Attorney Quill', purpose: 'injunction', referredOn: '2027-03-13' },
    signal,
    HOLD_LATER,
  )
  if (!referred.ok) throw new Error(referred.error)
  const outcome = await recordCounselOutcome(
    handle.db,
    world.permit.staff,
    { referralId: referred.value.referralId, kind, occurredOn: '2027-03-14' },
    signal,
  )
  if (!outcome.ok) throw new Error(outcome.error)
}

describe('a counsel motion on a case with no statutory order', () => {
  beforeEach(async () => {
    await start(NO_ORDER_CURE)
  })

  it('moves the case to In court and leaves the hold placeable and releasable', async () => {
    const { caseId, findingId } = await hold.noticedCase()
    await referAndMove(caseId, 'motion_filed')
    expect((await statusOf(caseId)).status).toBe('in_court')
    const placed = await hold.place(caseId, d('2027-03-15'))
    if (!placed.ok) throw new Error(placed.error)
    await markFindingCorrected(
      handle.db,
      world.permit.staff,
      { findingId, correctedOn: '2027-03-20', note: '' },
      signal,
    )
    const released = await releaseDevelopmentHold(
      handle.db,
      world.permit.staff,
      { holdId: placed.value.holdId, releasedOn: d('2027-03-21') },
      signal,
    )
    expect(released).toEqual({ ok: true, value: undefined })
  })

  it('leaves the status alone for an outcome that is not in court', async () => {
    const { caseId } = await hold.noticedCase()
    await referAndMove(caseId, 'settled')
    expect((await statusOf(caseId)).status).toBe('violation_found')
  })
})

describe('a counsel motion on a case with an order path', () => {
  beforeEach(async () => {
    await start(XX_CURE)
  })

  it('leaves the case at Violation found', async () => {
    const { caseId } = await hold.noticedCase()
    await referAndMove(caseId, 'motion_filed')
    expect((await statusOf(caseId)).status).toBe('violation_found')
    const moved = await setCaseStatus(
      handle.db,
      world.permit.staff,
      { caseId, to: 'in_court', expectedRowVersion: (await statusOf(caseId)).rowVersion },
      signal,
    )
    expect(moved).toEqual({ ok: false, error: 'invalid_transition' })
  })
})

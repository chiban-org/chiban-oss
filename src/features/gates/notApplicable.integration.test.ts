import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LIST_ISSUED_GATE_KEY } from '@/features/abutters/freshnessGate'
import { loadApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { linkReliance } from '@/features/boards/exercise'
import { recordFinalWrittenApproval } from '@/features/decisions/recording'
import { varianceGateDefinitions } from '@/features/decisions/recordingGate'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { registerGate } from '@/features/gates/registry'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decideUnderXx, HEARING_DATE } from '@/test/deliveryFixtures'
import { XX_VARIANCE_GATE, XX_VARIANCE_GATE_KEY } from '@/test/packs/xx/varianceGate'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb

async function gateResults(applicationId: string, to: CoreState) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  return await handle.db.transaction((tx) =>
    evaluateGates(tx, app as NonNullable<typeof app>, to, '2027-06-01' as CivilDate, signal),
  )
}

afterEach(async () => {
  await handle.drop()
})

describe('a permit that needs no abutter list', () => {
  let world: PermitWorld
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupPermitWorld(handle.db)
  })

  it('has no abutter list issued result while under review', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'submitted' })
    const results = await gateResults(permit.applicationId, 'under_review')
    expect(results.map((r) => r.key)).not.toContain(LIST_ISSUED_GATE_KEY)
  })
})

describe('the variance recorded gate', () => {
  let world: BoardWorld
  beforeAll(() => {
    setActivePackForTest(XX_VARIANCE_GATE)
    for (const gate of varianceGateDefinitions()) registerGate(gate)
  })
  afterAll(() => {
    setActivePackForTest(null)
  })
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupBoardWorld(handle.db, {
      zbaMeetings: [HEARING_DATE],
      pack: XX_VARIANCE_GATE,
      classificationKey: 'xx.board_variance',
    })
  })

  it('has no result for an application with no reliance links', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    const results = await gateResults(permit.applicationId, 'issued')
    expect(results.map((r) => r.key)).not.toContain(XX_VARIANCE_GATE_KEY)
  })

  it('still blocks a permit relying on an unrecorded variance', async () => {
    const made = await decideUnderXx(handle.db, world)
    const approved = await recordFinalWrittenApproval(
      handle.db,
      world.staff,
      { decisionId: made.decisionId, approvedOn: '2027-04-20' as CivilDate },
      signal,
      new Date('2027-09-30T16:00:00Z'),
    )
    expect(approved.ok).toBe(true)
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    await linkReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: made.applicationId, planningApplicationId: permit.applicationId },
      signal,
    )
    const results = await gateResults(permit.applicationId, 'issued')
    expect(results.find((r) => r.key === XX_VARIANCE_GATE_KEY)?.effective).toBe('blocked')
  })
})

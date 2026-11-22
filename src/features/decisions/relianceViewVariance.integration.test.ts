import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, projects } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { linkReliance } from '@/features/boards/exercise'
import { recordFinalWrittenApproval } from '@/features/decisions/recording'
import { varianceGateDefinitions } from '@/features/decisions/recordingGate'
import { loadRelianceView } from '@/features/decisions/relianceView'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { registerGate } from '@/features/gates/registry'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decideUnderXx, HEARING_DATE } from '@/test/deliveryFixtures'
import { XX_VARIANCE_GATE, XX_VARIANCE_GATE_KEY } from '@/test/packs/xx/varianceGate'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-09-30T16:00:00Z')
let handle: TestDb
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
afterEach(async () => {
  await handle.drop()
})

async function approvedVariance() {
  const made = await decideUnderXx(handle.db, world)
  const approved = await recordFinalWrittenApproval(
    handle.db,
    world.staff,
    { decisionId: made.decisionId, approvedOn: '2027-04-20' as CivilDate },
    signal,
    NOW,
  )
  if (!approved.ok) throw new Error(`approval: ${approved.error}`)
  return made
}

async function parcelOf(applicationId: string): Promise<string> {
  const [row] = await handle.db
    .select({ parcelId: projects.parcelId })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(applications.id, applicationId))
  return row?.parcelId ?? ''
}

async function view(applicationId: string) {
  return await loadRelianceView(handle.db, applicationId, await parcelOf(applicationId), signal)
}

describe('the reliance view on a variance', () => {
  it('returns no view for the variance itself', async () => {
    const made = await approvedVariance()
    expect(await view(made.applicationId)).toBeNull()
  })

  it('keeps the reliance of a permit linked to an unrecorded variance, and blocks it', async () => {
    const made = await approvedVariance()
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    await linkReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: made.applicationId, planningApplicationId: permit.applicationId },
      signal,
    )
    expect((await view(permit.applicationId))?.linked).toMatchObject([
      { id: made.applicationId, validity: 'pending_recording' },
    ])
    const app = await loadApplicationContext(handle.db, permit.applicationId, signal)
    const results = await handle.db.transaction((tx) =>
      evaluateGates(
        tx,
        app as NonNullable<typeof app>,
        'issued',
        '2027-06-01' as CivilDate,
        signal,
      ),
    )
    expect(results.find((r) => r.key === XX_VARIANCE_GATE_KEY)?.effective).toBe('blocked')
  })
})

import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, auditLog, documents, relianceLinks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { linkReliance } from '@/features/boards/exercise'
import {
  recordDecisionRecording,
  recordFinalWrittenApproval,
  varianceValidity,
} from '@/features/decisions/recording'
import {
  linkVarianceReliance,
  unlinkVarianceReliance,
  varianceGateDefinitions,
} from '@/features/decisions/recordingGate'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { registerGate } from '@/features/gates/registry'
import { setActivePackForTest } from '@/features/packs/registry'
import { markUnrecordedVoid } from '@/jobs/clocksDaily'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decideUnderXx, HEARING_DATE } from '@/test/deliveryFixtures'
import { XX_VARIANCE_GATE, XX_VARIANCE_GATE_KEY } from '@/test/packs/xx/varianceGate'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const APPROVED = d('2027-04-20')
const DUE = addDays(APPROVED, 90)
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

async function approved() {
  const made = await decideUnderXx(handle.db, world)
  const result = await recordFinalWrittenApproval(
    handle.db,
    world.staff,
    { decisionId: made.decisionId, approvedOn: APPROVED },
    signal,
    NOW,
  )
  if (!result.ok) throw new Error(`approval: ${result.error}`)
  return made
}

async function record(made: { applicationId: string; decisionId: string }) {
  const [doc] = await handle.db
    .insert(documents)
    .values({
      recordKind: 'application',
      recordId: made.applicationId,
      title: 'Certificate of approval',
      docKind: 'attachment',
      createdByKind: 'system',
    })
    .returning({ id: documents.id })
  const result = await recordDecisionRecording(
    handle.db,
    world.staff,
    {
      decisionId: made.decisionId,
      registry: 'Vellmora County Registry of Deeds',
      book: '4410',
      page: '212',
      recordedOn: d('2027-05-10'),
      certificateDocumentId: doc?.id ?? '',
    },
    signal,
    NOW,
  )
  if (!result.ok) throw new Error(`recording: ${result.error}`)
}

async function numberOf(applicationId: string) {
  const [row] = await handle.db
    .select({ number: applications.number })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.number ?? ''
}

async function gateResult(applicationId: string, to: 'issued' | 'decided') {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app as NonNullable<typeof app>, to, d('2027-06-01'), signal),
  )
  return results.find((g) => g.key === XX_VARIANCE_GATE_KEY)
}

describe('varianceValidity', () => {
  it('is not_required for an application whose classification needs no recording', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    expect(await varianceValidity(handle.db, permit.applicationId, signal)).toBe('not_required')
  })

  it('is pending_recording once approved and recorded after the registry entry', async () => {
    const made = await approved()
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('pending_recording')
    await record(made)
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('recorded')
  })

  it('is void when the void clock has lapsed', async () => {
    const made = await approved()
    await handle.db.transaction((tx) => markUnrecordedVoid(tx, addDays(DUE, 1), signal))
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('void')
  })

  it('is not_required for a denied variance', async () => {
    const made = await decideUnderXx(handle.db, world)
    await handle.db.execute(sql`update board_decisions set outcome = 'denied'`)
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('not_required')
  })
})

describe('the dependent permit gate', () => {
  it('blocks a linked permit until the variance is recorded, then passes', async () => {
    const made = await approved()
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    await linkReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: made.applicationId, planningApplicationId: permit.applicationId },
      signal,
    )
    const reason = `Relies on ${await numberOf(made.applicationId)}, which is not valid until its certificate is recorded.`
    for (const to of ['issued', 'decided'] as const) {
      const blocked = await gateResult(permit.applicationId, to)
      expect(blocked?.outcome).toEqual({ status: 'blocked', reason })
      expect(blocked?.effective).toBe('blocked')
    }
    await record(made)
    const passed = await gateResult(permit.applicationId, 'issued')
    expect(passed?.outcome).toEqual({ status: 'pass' })
  })

  it('blocks a permit that relies on a void variance', async () => {
    const made = await approved()
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    await linkReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: made.applicationId, planningApplicationId: permit.applicationId },
      signal,
    )
    await handle.db.transaction((tx) => markUnrecordedVoid(tx, addDays(DUE, 1), signal))
    expect((await gateResult(permit.applicationId, 'issued'))?.outcome.status).toBe('blocked')
  })

  it('passes again once staff remove a wrong link, and audits the removal', async () => {
    const made = await approved()
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    const link = {
      varianceApplicationId: made.applicationId,
      planningApplicationId: permit.applicationId,
    }
    await linkReliance(handle.db, world.staff, link, signal)
    await handle.db.transaction((tx) => markUnrecordedVoid(tx, addDays(DUE, 1), signal))
    expect((await gateResult(permit.applicationId, 'issued'))?.outcome.status).toBe('blocked')
    expect(await unlinkVarianceReliance(handle.db, world.reviewer, link, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await unlinkVarianceReliance(handle.db, world.staff, link, signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await handle.db.select().from(relianceLinks)).toEqual([])
    expect(await gateResult(permit.applicationId, 'issued')).toBeUndefined()
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'board.reliance.unlink'))
    expect(audit).toMatchObject({ entityType: 'application', entityId: permit.applicationId })
    expect(await unlinkVarianceReliance(handle.db, world.staff, link, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('leaves the gate off a permit with no link', async () => {
    await approved()
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    expect(await gateResult(permit.applicationId, 'issued')).toBeUndefined()
  })
})

describe('linking a permit to a variance', () => {
  it('links a variance on the same parcel and offers it on the permit page', async () => {
    const made = await approved()
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    const before = await getStaffApplicationView(
      handle.db,
      world.staff,
      permit.applicationId,
      NOW,
      signal,
    )
    expect(before?.reliance?.choices).toEqual([
      { id: made.applicationId, number: await numberOf(made.applicationId) },
    ])
    expect(before?.reliance?.linked).toEqual([])
    const linked = await linkVarianceReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: made.applicationId, planningApplicationId: permit.applicationId },
      signal,
    )
    expect(linked).toEqual({ ok: true, value: undefined })
    const after = await getStaffApplicationView(
      handle.db,
      world.staff,
      permit.applicationId,
      NOW,
      signal,
    )
    expect(after?.reliance?.choices).toEqual([])
    expect(after?.reliance?.linked).toEqual([
      {
        id: made.applicationId,
        number: await numberOf(made.applicationId),
        validity: 'pending_recording',
      },
    ])
  })

  it('refuses an application that is not a variance needing a recording', async () => {
    const made = await approved()
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    const other = await makeApplication(handle.db, world, { state: 'decided' })
    expect(
      await linkVarianceReliance(
        handle.db,
        world.staff,
        { varianceApplicationId: other.applicationId, planningApplicationId: permit.applicationId },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(
      await linkVarianceReliance(
        handle.db,
        world.applicant,
        { varianceApplicationId: made.applicationId, planningApplicationId: permit.applicationId },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('shows the validity on the variance page itself', async () => {
    const made = await approved()
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      made.applicationId,
      NOW,
      signal,
    )
    expect(view?.varianceValidity).toBe('pending_recording')
  })
})

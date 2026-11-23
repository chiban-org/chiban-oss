import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, documents } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import {
  recordDecisionRecording,
  recordFinalWrittenApproval,
  varianceValidity,
} from '@/features/decisions/recording'
import {
  linkVarianceReliance,
  reliesOnUnrecordedReason,
  varianceGateDefinitions,
} from '@/features/decisions/recordingGate'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { registerGate } from '@/features/gates/registry'
import { setActivePackForTest } from '@/features/packs/registry'
import { markUnrecordedVoid } from '@/jobs/clocksDaily'
import { makeApplication } from '@/test/applicationFixtures'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { addAgentParty, deliver, deliveriesOf } from '@/test/deliveryFixtures'
import {
  BOA_ADMIN_TYPE,
  BOA_HEARING,
  BOA_MEETINGS,
  BOA_RECEIVED,
  BOA_VARIANCE_TYPE,
  decidedBoa,
  incompleteAtBoard,
  ME_PERMIT_TYPE,
  publishBoardOfAppealsTypes,
} from '@/test/maineBoardOfAppealsFixtures'
import { clocksOf } from '@/test/maineSubdivisionFixtures'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const APPROVED_ON = '2027-04-20'
const LAST_DAY = '2027-07-19'
const DAY_91 = '2027-07-20'
const GATE = 'me.boa.variance_recorded'
const VOID_CLOCK = 'me.boa.final_written_approval'
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: BOA_MEETINGS })
  setActivePackForTest(ME_PACK)
  for (const gate of varianceGateDefinitions()) registerGate(gate)
  await publishBoardOfAppealsTypes(handle.db, world)
  await addAgentParty(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function approvedVariance() {
  const made = await decidedBoa(handle.db, world)
  const approved = await recordFinalWrittenApproval(
    handle.db,
    world.staff,
    { decisionId: made.decisionId, approvedOn: d(APPROVED_ON) },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!approved.ok) throw new Error(`approval: ${approved.error}`)
  return made
}

async function dependentPermit(varianceApplicationId: string) {
  const permit = await makeApplication(
    handle.db,
    world,
    { state: 'decided' },
    BOARD_FIXTURE_NOW,
    ME_PERMIT_TYPE,
  )
  const linked = await linkVarianceReliance(
    handle.db,
    world.staff,
    { varianceApplicationId, planningApplicationId: permit.applicationId },
    signal,
  )
  expect(linked).toEqual({ ok: true, value: undefined })
  return permit.applicationId
}

async function gateOf(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing application')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'issued', d('2027-06-01'), signal),
  )
  return results.find((g) => g.key === GATE)
}

async function runVoidJob(today: string) {
  return await handle.db.transaction((tx) => markUnrecordedVoid(tx, d(today), signal))
}

async function numberOf(applicationId: string) {
  const [row] = await handle.db
    .select({ number: applications.number })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.number ?? ''
}

describe('a Maine variance waiting for its recorded certificate', () => {
  it('blocks a dependent building permit and lapses on day 91', async () => {
    const made = await approvedVariance()
    expect(await clocksOf(handle.db, made.applicationId, VOID_CLOCK)).toMatchObject([
      { status: 'running', startDate: APPROVED_ON, currentDue: LAST_DAY },
    ])
    const permitId = await dependentPermit(made.applicationId)
    const reason = reliesOnUnrecordedReason(await numberOf(made.applicationId))
    expect(await gateOf(permitId)).toMatchObject({
      outcome: { status: 'blocked', reason },
      effective: 'blocked',
    })
    expect(await runVoidJob(LAST_DAY)).toEqual({ voided: [] })
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('pending_recording')
    expect(await runVoidJob(DAY_91)).toEqual({ voided: [made.applicationId] })
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('void')
    expect((await gateOf(permitId))?.effective).toBe('blocked')
  })

  it('lets the permit through once the certificate is recorded on the last day', async () => {
    const made = await approvedVariance()
    const permitId = await dependentPermit(made.applicationId)
    const [doc] = await handle.db
      .insert(documents)
      .values({
        recordKind: 'application',
        recordId: made.applicationId,
        title: 'Variance certificate',
        docKind: 'attachment',
        createdByKind: 'system',
      })
      .returning({ id: documents.id })
    const recorded = await recordDecisionRecording(
      handle.db,
      world.staff,
      {
        decisionId: made.decisionId,
        registry: 'Fernhollow County Registry of Deeds',
        book: '5120',
        page: '77',
        recordedOn: d(LAST_DAY),
        certificateDocumentId: doc?.id ?? '',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(recorded).toEqual({ ok: true, value: undefined })
    expect((await gateOf(permitId))?.outcome).toEqual({ status: 'pass' })
    expect(await runVoidJob(DAY_91)).toEqual({ voided: [] })
  })

  it('asks no recording of an administrative appeal', async () => {
    const made = await decidedBoa(handle.db, world, { typeKey: BOA_ADMIN_TYPE })
    expect(await varianceValidity(handle.db, made.applicationId, signal)).toBe('not_required')
    expect(await clocksOf(handle.db, made.applicationId, VOID_CLOCK)).toEqual([])
  })
})

describe('delivering a Board of Appeals decision', () => {
  it('lists four recipients and meets the clock once all four are delivered', async () => {
    const made = await decidedBoa(handle.db, world)
    const rows = await deliveriesOf(handle.db, made.applicationId)
    expect(rows.map((r) => r.recipientRole)).toEqual([
      'agent',
      'applicant',
      'municipal_officers',
      'planning_board',
    ])
    expect(await clocksOf(handle.db, made.applicationId, 'me.boa.delivery_due')).toMatchObject([
      { status: 'running', startDate: BOA_HEARING, currentDue: '2027-04-22' },
    ])
    const [last, ...rest] = rows
    for (const [index, row] of rest.entries()) {
      const method = index === 0 ? 'hand' : 'mail'
      expect((await deliver(handle.db, world.staff, row.id, '2027-04-19', method)).ok).toBe(true)
    }
    expect(await clocksOf(handle.db, made.applicationId, 'me.boa.delivery_due')).toMatchObject([
      { status: 'running' },
    ])
    expect((await deliver(handle.db, world.staff, last?.id ?? '', '2027-04-21')).ok).toBe(true)
    expect(await clocksOf(handle.db, made.applicationId, 'me.boa.delivery_due')).toMatchObject([
      { status: 'met', metOn: '2027-04-21' },
    ])
  })
})

describe('a Board of Appeals application found incomplete', () => {
  it('stays open awaiting the missing material', async () => {
    const id = await submitBoardApplication(handle.db, world, BOA_VARIANCE_TYPE, BOA_RECEIVED)
    await incompleteAtBoard(handle.db, world, id)
    const [row] = await handle.db
      .select({ state: applications.state, closureReason: applications.closureReason })
      .from(applications)
      .where(eq(applications.id, id))
    expect(row).toEqual({ state: 'submitted', closureReason: null })
  })
})

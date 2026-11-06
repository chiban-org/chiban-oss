import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { dispositionBatches, recordEvents } from '@/db/schema'
import { proposeDisposition } from '@/features/disposition/propose'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { lazy } from '@/test/boardPanelFixtures'
import { DISPOSITION_NOW, eligibleCase } from '@/test/dispositionFixtures'
import { seedParcelWorld } from '@/test/parcels'
import { dateCopy } from '@/test/recordsCases'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { todayInTimeZone } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal
const today = todayInTimeZone('America/New_York', DISPOSITION_NOW)
const AS_OF = '2027-03-01'

const eligible = lazy(async () => await eligibleCase(h.db, h.store, await h.actorFor('staff'), 1))

const proposedBatch = async () => {
  await eligibleCase(h.db, h.store, await h.actorFor('staff'), 1, `batch ${Math.random()}`)
  const proposed = await proposeDisposition(
    h.db,
    await h.actorFor('staff'),
    { asOf: AS_OF as never },
    signal,
    DISPOSITION_NOW,
  )
  if (!proposed.ok) throw new Error(`propose ${proposed.error}`)
  return proposed.value.batchId
}

beforeAll(async () => {
  await seedParcelWorld(h.db)
  await eligible()
  vi.useFakeTimers({ toFake: ['Date'], now: DISPOSITION_NOW })
})
afterAll(() => {
  vi.useRealTimers()
})

describeActionCases(h, 'recordRetentionEventAction', {
  invoke: actions.recordRetentionEventAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    targetKind: 'case',
    targetId: (await eligible()).caseId,
    kind: 'appeal_period_expired',
    occurredOn: '2027-02-20',
  }),
  fields: {
    targetKind: choice({ required: true }),
    targetId: uuid({ required: true }),
    kind: choice({ required: true }),
    occurredOn: date({ required: true, earliest: '1900-01-01', latest: today }),
    note: text({ max: 1000 }),
  },
  capability: 'document.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      targetKind: 'Choose what the event is about.',
      targetId: 'Choose a record.',
      kind: 'Choose what happened.',
      occurredOn: dateCopy('the date it happened', today),
      note: 'Enter a note of 1000 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Event recorded. The retention clock now runs from that date.',
    })
    expect(written).toEqual(['audit_log', 'record_events'])
    const events = await db.select().from(recordEvents)
    expect(events.at(-1)).toMatchObject({ kind: 'appeal_period_expired', occurredOn: '2027-02-20' })
  },
})

describe('recordRetentionEventAction targets', () => {
  it('refuses an event that does not apply to the record, beside the choice', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({
      targetKind: 'case',
      targetId: (await eligible()).caseId,
      kind: 'building_removed',
      occurredOn: '2027-02-20',
    })
    expect(await actions.recordRetentionEventAction(form)).toEqual(
      refuseField('kind', 'That event does not apply to this kind of record.'),
    )
  })
})

describeActionCases(h, 'proposeDispositionAction', {
  invoke: actions.proposeDispositionAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ asOf: AS_OF }),
  fields: { asOf: date({ required: true, earliest: '1900-01-01', latest: today }) },
  capability: ['disposition.propose', 'disposition.approve'],
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ asOf: dateCopy('the date', today) }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message:
        'Batch proposed. A records custodian has to approve it before anything is disposed of.',
    })
    expect(written).toContain('disposition_batches')
    expect((await db.select().from(dispositionBatches)).length).toBeGreaterThan(0)
  },
})

describe('proposeDispositionAction dates', () => {
  it('says nothing is eligible beside the date', async () => {
    h.signIn(await h.actorFor('staff'))
    expect(await actions.proposeDispositionAction(h.form({ asOf: '2020-01-01' }))).toEqual(
      refuseField('asOf', 'No records are eligible on that date.'),
    )
  })
})

describeActionCases(h, 'approveDispositionAction', {
  invoke: actions.approveDispositionAction,
  actor: () => h.actorFor('records_custodian'),
  input: async () => ({ batchId: await proposedBatch() }),
  fields: { batchId: uuid({ required: true }) },
  capability: 'disposition.approve',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ batchId: 'Choose a batch.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Batch approved and carried out. Each disposed record left a tombstone.',
    })
    expect(written).toContain('disposition_tombstones')
    const batches = await db.select().from(dispositionBatches)
    expect(batches.find((b) => b.id === input.batchId)?.status).toBe('executed')
  },
})

describe('approveDispositionAction own proposal', () => {
  it('refuses a custodian approving a batch they proposed', async () => {
    const custodian = await h.actorFor('records_custodian')
    await eligibleCase(h.db, h.store, await h.actorFor('staff'), 1, 'own')
    const proposed = await proposeDisposition(
      h.db,
      custodian,
      { asOf: AS_OF as never },
      signal,
      DISPOSITION_NOW,
    )
    if (!proposed.ok) throw new Error('propose')
    h.signIn(custodian)
    expect(
      await actions.approveDispositionAction(h.form({ batchId: proposed.value.batchId })),
    ).toEqual({
      ok: false,
      error: 'You proposed this batch, so another records custodian has to approve it.',
    })
  })
})

describeActionCases(h, 'cancelDispositionAction', {
  invoke: actions.cancelDispositionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ batchId: await proposedBatch() }),
  fields: { batchId: uuid({ required: true }) },
  capability: ['disposition.propose', 'disposition.approve'],
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ batchId: 'Choose a batch.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Batch cancelled.' })
    expect(written).toEqual(['audit_log', 'disposition_batches'])
    const batches = await db.select().from(dispositionBatches)
    expect(batches.find((b) => b.id === input.batchId)?.status).toBe('cancelled')
  },
})

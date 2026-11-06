import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { restrictionHoldings, rosterReviews } from '@/db/schema'
import { endRestriction } from '@/features/rosters/restrictionEnd'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { PAST_ONLY, pastDateMessage, useEnforcementClock } from '@/test/enforcementCases'
import { refusalBy } from '@/test/refusalCopy'
import { freshParcel, listedHolding } from '@/test/rosterCaseFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
useEnforcementClock()
const signal = new AbortController().signal
let world: BoardWorld

beforeAll(async () => {
  world = await setupBoardWorld(h.db)
})

const staff = () => h.actorFor('staff')

const holderInput = {
  holderName: 'Heron Land Trust',
  holderMailingAddress: '2 Trust Way, Alder Pond NH 03999',
  restrictionKind: 'conservation',
  recordedReference: 'Book 1204, page 88',
}

const holderFields = {
  holderName: text({ required: true, max: 200 }),
  holderMailingAddress: text({ required: true, max: 300 }),
  restrictionKind: choice({ required: true }),
  recordedReference: text({ required: true, max: 300 }),
}

const holderCopy = {
  holderName: (v: InvalidVariant) => textMessage('the holder name', 200, v),
  holderMailingAddress: (v: InvalidVariant) => textMessage('the holder mailing address', 300, v),
  restrictionKind: () => 'Choose a kind.',
  recordedReference: (v: InvalidVariant) => textMessage('where it is recorded', 300, v),
}

const holdingRow = async (holdingId: string) => {
  const [row] = await h.db
    .select({
      holder: restrictionHoldings.holderName,
      reference: restrictionHoldings.recordedReference,
      endedOn: restrictionHoldings.endedOn,
    })
    .from(restrictionHoldings)
    .where(eq(restrictionHoldings.id, holdingId))
  return row
}

async function endedHolding(): Promise<string> {
  const holdingId = await listedHolding(h.db, world.staff)
  const ended = await endRestriction(
    h.db,
    world.staff,
    { holdingId, endedOn: '2027-07-15' as CivilDate },
    signal,
  )
  if (!ended.ok) throw new Error(ended.error)
  return holdingId
}

describeActionCases(h, 'addRestrictionAction', {
  invoke: actions.addRestrictionAction,
  actor: staff,
  input: async () => ({ parcelRef: (await freshParcel(h.db)).ref, ...holderInput }),
  fields: { parcelRef: text({ required: true, max: 200 }), ...holderFields },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ parcelRef: (v) => textMessage('the parcel', 200, v), ...holderCopy }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Restriction holder added.' })
    expect(written).toEqual(expect.arrayContaining(['restriction_holdings', 'audit_log']))
    const rows = await db
      .select({ reference: restrictionHoldings.recordedReference })
      .from(restrictionHoldings)
    expect(rows).toContainEqual({ reference: 'Book 1204, page 88' })
  },
})

describeActionCases(h, 'updateRestrictionAction', {
  invoke: actions.updateRestrictionAction,
  actor: staff,
  input: async () => ({
    holdingId: await listedHolding(h.db, world.staff),
    ...holderInput,
    recordedReference: 'Book 1300, page 12',
  }),
  fields: { holdingId: uuid({ required: true }), ...holderFields },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ holdingId: () => idMessage('a holder'), ...holderCopy }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Restriction holder saved.' })
    expect(written).toEqual(expect.arrayContaining(['restriction_holdings', 'audit_log']))
    expect((await holdingRow(String(input.holdingId)))?.reference).toBe('Book 1300, page 12')
  },
})

describeActionCases(h, 'endRestrictionAction', {
  invoke: actions.endRestrictionAction,
  actor: staff,
  input: async () => ({
    holdingId: await listedHolding(h.db, world.staff),
    endedOn: '2027-07-15',
  }),
  fields: {
    holdingId: uuid({ required: true }),
    endedOn: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      holdingId: () => idMessage('a holder'),
      endedOn: (v) => pastDateMessage('the end date', v),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Restriction ended.' })
    expect(written).toEqual(expect.arrayContaining(['restriction_holdings', 'audit_log']))
    expect((await holdingRow(String(input.holdingId)))?.endedOn).toBe('2027-07-15')
  },
})

describeActionCases(h, 'undoRestrictionEndAction', {
  invoke: actions.undoRestrictionEndAction,
  actor: staff,
  input: async () => ({ holdingId: await endedHolding() }),
  fields: { holdingId: uuid({ required: true }) },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ holdingId: () => idMessage('a holder') }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'The ending was undone.' })
    expect(written).toEqual(expect.arrayContaining(['restriction_holdings', 'audit_log']))
    expect((await holdingRow(String(input.holdingId)))?.endedOn).toBeNull()
  },
})

describeActionCases(h, 'recordLandRecordsCheckAction', {
  invoke: actions.recordLandRecordsCheckAction,
  actor: staff,
  input: () => ({}),
  fields: {},
  capability: 'abutters.manage',
  refusals: { ...STAFF_REFUSALS, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Land records check recorded.' })
    expect(written).toEqual(expect.arrayContaining(['roster_reviews', 'audit_log']))
    const rows = await db
      .select({ kind: rosterReviews.kind, reviewedOn: rosterReviews.reviewedOn })
      .from(rosterReviews)
    expect(rows).toContainEqual({ kind: 'restrictions', reviewedOn: '2027-07-20' })
  },
})

describe('the sweep findings on restriction holders', () => {
  it('names the recorded reference field for three spaces and adds nothing', async () => {
    h.signIn(await staff())
    const form = h.form({
      parcelRef: (await freshParcel(h.db)).ref,
      ...holderInput,
      recordedReference: '   ',
    })
    const outcome = await h.recordWrites(() => actions.addRestrictionAction(form))
    expect(outcome).toEqual({
      value: refuseField('recordedReference', 'Enter where it is recorded.'),
      written: [],
    })
  })

  it('names the end date field for an ending dated 2099', async () => {
    h.signIn(await staff())
    const form = h.form({
      holdingId: await listedHolding(h.db, world.staff),
      endedOn: '2099-01-01',
    })
    const outcome = await h.recordWrites(() => actions.endRestrictionAction(form))
    expect(outcome).toEqual({
      value: refuseField(
        'endedOn',
        'Enter the end date between January 1, 1900 and July 20, 2027.',
      ),
      written: [],
    })
  })
})

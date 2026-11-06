import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { associationRosters, parkRosters } from '@/db/schema'
import { endRosterEntry } from '@/features/rosters/rosterEnd'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage } from '@/test/boardCases'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { PAST_ONLY, pastDateMessage, useEnforcementClock } from '@/test/enforcementCases'
import { refusalBy } from '@/test/refusalCopy'
import { listedAssociation, listedPark } from '@/test/rosterCaseFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./rosterEndActions')
const confirms = await import('./confirmActions')

const h = actionHarness()
useEnforcementClock()
const signal = new AbortController().signal
let world: BoardWorld

beforeAll(async () => {
  world = await setupBoardWorld(h.db)
})

const staff = () => h.actorFor('staff')

const associationEndedOn = async (entryId: string) => {
  const [row] = await h.db
    .select({ endedOn: associationRosters.endedOn })
    .from(associationRosters)
    .where(eq(associationRosters.id, entryId))
  return row?.endedOn
}

async function endedAssociation(): Promise<string> {
  const { entryId } = await listedAssociation(h.db, world.staff)
  const ended = await endRosterEntry(
    h.db,
    world.staff,
    { kind: 'association', entryId, endedOn: '2027-07-15' as CivilDate },
    signal,
  )
  if (!ended.ok) throw new Error(ended.error)
  return entryId
}

describeActionCases(h, 'endRosterEntryAction', {
  invoke: actions.endRosterEntryAction,
  actor: staff,
  input: async () => ({
    kind: 'association',
    entryId: (await listedAssociation(h.db, world.staff)).entryId,
    endedOn: '2027-07-15',
  }),
  fields: {
    kind: choice({ required: true }),
    entryId: uuid({ required: true }),
    endedOn: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      kind: () => 'Choose what to end.',
      entryId: () => idMessage('an entry'),
      endedOn: (v) => pastDateMessage('the end date', v),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Condo association ended.' })
    expect(written).toEqual(expect.arrayContaining(['association_rosters', 'audit_log']))
    expect(await associationEndedOn(String(input.entryId))).toBe('2027-07-15')
  },
})

describeActionCases(h, 'undoRosterEndAction', {
  invoke: actions.undoRosterEndAction,
  actor: staff,
  input: async () => ({ kind: 'association', entryId: await endedAssociation() }),
  fields: { kind: choice({ required: true }), entryId: uuid({ required: true }) },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      kind: () => 'Choose what to end.',
      entryId: () => idMessage('an entry'),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'The ending was undone.' })
    expect(written).toEqual(expect.arrayContaining(['association_rosters', 'audit_log']))
    expect(await associationEndedOn(String(input.entryId))).toBeNull()
  },
})

describeActionCases(h, 'confirmEntryAction', {
  invoke: confirms.confirmEntryAction,
  actor: staff,
  input: async () => ({
    kind: 'park',
    entryId: (await listedPark(h.db, world.staff)).entryId,
  }),
  fields: { kind: choice({ required: true }), entryId: uuid({ required: true }) },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      kind: () => 'Choose what to confirm.',
      entryId: () => idMessage('an entry'),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Marked as still correct today.' })
    expect(written).toContain('audit_log')
    const [row] = await db
      .select({ checkedOn: parkRosters.checkedOn })
      .from(parkRosters)
      .where(eq(parkRosters.id, String(input.entryId)))
    expect(row?.checkedOn).toBe('2027-07-20')
  },
})

describe('the sweep findings on ending a roster entry', () => {
  it('names the end date field for an ending before the list date and ends nothing', async () => {
    h.signIn(await staff())
    const { entryId } = await listedAssociation(h.db, world.staff)
    const form = h.form({ kind: 'association', entryId, endedOn: '2000-01-01' })
    const outcome = await h.recordWrites(() => actions.endRosterEntryAction(form))
    expect(outcome).toEqual({
      value: refuseField('endedOn', 'The end date cannot be before the date the list is current.'),
      written: [],
    })
    expect(await associationEndedOn(entryId)).toBeNull()
  })

  it('names the end date field for an ending dated 2099', async () => {
    h.signIn(await staff())
    const { entryId } = await listedAssociation(h.db, world.staff)
    const form = h.form({ kind: 'association', entryId, endedOn: '2099-01-01' })
    const outcome = await h.recordWrites(() => actions.endRosterEntryAction(form))
    expect(outcome).toEqual({
      value: refuseField(
        'endedOn',
        'Enter the end date between January 1, 1900 and July 20, 2027.',
      ),
      written: [],
    })
  })
})

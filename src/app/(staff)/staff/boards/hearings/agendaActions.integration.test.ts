import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { agendaItems, agendas, boardMeetings } from '@/db/schema'
import { addAgendaItem } from '@/features/agendas/agendas'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { setupBoardWorld } from '@/test/boardFixtures'
import {
  actionHarness,
  choice,
  describeActionCases,
  type InvalidVariant,
  int,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')
const boardActions = await import('../actions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal

const OPEN_DATE = '2031-04-15'
const CANCEL_DATE = '2031-05-20'
let openMeetingId = ''
let cancelMeetingId = ''

async function meetingOn(date: string): Promise<string> {
  const [row] = await h.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(eq(boardMeetings.meetingDate, date))
  return row?.id ?? ''
}

async function itemIds(): Promise<string[]> {
  const rows = await h.db
    .select({ id: agendaItems.id })
    .from(agendaItems)
    .where(eq(agendaItems.meetingId, openMeetingId))
    .orderBy(asc(agendaItems.position))
  return rows.map((r) => r.id)
}

beforeAll(async () => {
  const world = await setupBoardWorld(h.db, { zbaMeetings: [OPEN_DATE, CANCEL_DATE] })
  openMeetingId = await meetingOn(OPEN_DATE)
  cancelMeetingId = await meetingOn(CANCEL_DATE)
  for (const title of ['Seed one', 'Seed two', 'Seed three']) {
    await addAgendaItem(
      h.db,
      world.staff,
      { meetingId: openMeetingId, kind: 'business', title },
      signal,
    )
  }
})

function addRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'meetingId':
      return refuseField('meetingId', idMessage('a meeting'))
    case 'kind':
      return refuseField('kind', 'Choose a kind of item.')
    case 'title':
      return refuseField('title', textMessage('a title', 200, variant))
    default:
      return refuseField('description', textMessage('a description', 5000, variant))
  }
}

describeActionCases(h, 'addAgendaItemAction', {
  invoke: actions.addAgendaItemAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    meetingId: openMeetingId,
    kind: 'business',
    title: '  Old business  ',
    description: 'Discuss the culvert.',
  }),
  fields: {
    meetingId: uuid({ required: true }),
    kind: choice({ required: true }),
    title: text({ required: true, max: 200 }),
    description: text({ max: 5000 }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: addRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Item added to the agenda.' })
    expect(written).toEqual(['agenda_items'])
    const rows = await db
      .select({ title: agendaItems.title, description: agendaItems.description })
      .from(agendaItems)
      .where(eq(agendaItems.meetingId, openMeetingId))
      .orderBy(asc(agendaItems.position))
    expect(rows.at(-1)).toEqual({ title: 'Old business', description: 'Discuss the culvert.' })
  },
})

describe('addAgendaItemAction with the whitespace title from the forms sweep', () => {
  it('refuses a title of three spaces beside the Title field and adds nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const before = (await itemIds()).length
    const form = h.form({ meetingId: openMeetingId, kind: 'business', title: '   ' })
    const { value, written } = await h.recordWrites(() => actions.addAgendaItemAction(form))
    expect({ value, written, added: (await itemIds()).length - before }).toEqual({
      value: refuseField('title', 'Enter a title.'),
      written: [],
      added: 0,
    })
  })
})

function moveRefusal(variant: InvalidVariant) {
  if (variant.field === 'itemId') return refuseField('itemId', idMessage('an agenda item'))
  return refuseField(
    'toPosition',
    variant.kind === 'missing'
      ? 'Enter a position.'
      : 'Enter a position as a whole number from 0 to 1000.',
  )
}

describeActionCases(h, 'moveAgendaItemAction', {
  invoke: actions.moveAgendaItemAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ itemId: (await itemIds()).at(-1) ?? '', toPosition: '0' }),
  fields: {
    itemId: uuid({ required: true }),
    toPosition: int({ required: true, min: 0, max: 1000 }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: moveRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Item moved.' })
    expect(written).toEqual(['agenda_items'])
    const rows = await db
      .select({ id: agendaItems.id })
      .from(agendaItems)
      .where(eq(agendaItems.meetingId, openMeetingId))
      .orderBy(asc(agendaItems.position))
    expect(rows[0]?.id).toBe(input.itemId)
  },
})

describeActionCases(h, 'removeAgendaItemAction', {
  invoke: actions.removeAgendaItemAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ itemId: (await itemIds()).at(-1) ?? '' }),
  fields: { itemId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('itemId', idMessage('an agenda item')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Item removed.' })
    expect(written).toEqual(['agenda_items'])
    const rows = await db
      .select({ id: agendaItems.id })
      .from(agendaItems)
      .where(eq(agendaItems.id, String(input.itemId)))
    expect(rows).toEqual([])
  },
})

describeActionCases(h, 'buildAgendaAction', {
  invoke: actions.buildAgendaAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ meetingId: openMeetingId }),
  fields: { meetingId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('meetingId', idMessage('a meeting')),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result) => {
    expect(result).toEqual({
      ok: true,
      message:
        'No hearings are scheduled for this meeting. A continued hearing is listed at the meeting it was continued to.',
    })
  },
})

describeActionCases(h, 'publishAgendaAction', {
  invoke: actions.publishAgendaAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ meetingId: openMeetingId }),
  fields: { meetingId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('meetingId', idMessage('a meeting')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Agenda published on the public site.' })
    const [agenda] = await db
      .select({ status: agendas.status })
      .from(agendas)
      .where(eq(agendas.meetingId, openMeetingId))
    expect(agenda).toEqual({ status: 'published' })
  },
})

describeActionCases(h, 'reopenAgendaAction', {
  invoke: actions.reopenAgendaAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ meetingId: openMeetingId }),
  fields: { meetingId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('meetingId', idMessage('a meeting')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Agenda reopened. Publishing again creates a new revision.',
    })
    const [agenda] = await db
      .select({ status: agendas.status })
      .from(agendas)
      .where(eq(agendas.meetingId, openMeetingId))
    expect(agenda).toEqual({ status: 'draft' })
  },
})

function cancelRefusal(variant: InvalidVariant) {
  return variant.field === 'meetingId'
    ? refuseField('meetingId', idMessage('a meeting'))
    : refuseField('reason', textMessage('a reason', 500, variant))
}

describeActionCases(h, 'cancelMeetingAction', {
  invoke: boardActions.cancelMeetingAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ meetingId: cancelMeetingId, reason: 'The hall is closed that week.' }),
  fields: { meetingId: uuid({ required: true }), reason: text({ required: true, max: 500 }) },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: cancelRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Meeting cancelled. Deadlines that depend on the calendar were recalculated.',
    })
    expect(written).toEqual(['audit_log', 'board_meetings'])
    const [row] = await db
      .select({ status: boardMeetings.status, reason: boardMeetings.cancelReason })
      .from(boardMeetings)
      .where(eq(boardMeetings.id, cancelMeetingId))
    expect(row).toEqual({ status: 'cancelled', reason: 'The hall is closed that week.' })
  },
})

import { count, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { boardMeetings } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import { boardIdOf } from '@/test/boardFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type FieldSpec,
  type InvalidVariant,
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

const { scheduleMeetingAction } = await import('./actions')

const h = actionHarness()

let day = 0
let zbaId = ''
beforeAll(async () => {
  zbaId = await boardIdOf(h.db, 'zba')
})
function nextMeeting(overrides: Record<string, string> = {}) {
  day += 1
  return {
    boardId: zbaId,
    meetingDate: `2031-03-${String(day).padStart(2, '0')}`,
    kind: 'regular',
    location: 'Town Hall, Room 2',
    startsAt: '18:30',
    ...overrides,
  }
}

const startTime: FieldSpec = {
  required: false,
  variants: [
    { kind: 'words', label: 'as words', value: 'noon' },
    { kind: 'above_max', label: 'past the end of the day', value: '24:00' },
  ],
}

function refusalFor(variant: InvalidVariant) {
  switch (variant.field) {
    case 'boardId':
      return refuseField('boardId', idMessage('a board'))
    case 'meetingDate':
      return refuseField('meetingDate', dateMessage('the meeting date', variant))
    case 'kind':
      return refuseField('kind', 'Choose a kind of meeting.')
    case 'startsAt':
      return refuseField('startsAt', 'Enter the start time as a time of day, like 7:00 PM.')
    default:
      return refuseField('location', textMessage('a location', 200, variant))
  }
}

describeActionCases(h, 'scheduleMeetingAction', {
  invoke: scheduleMeetingAction,
  actor: () => h.actorFor('admin'),
  input: () => nextMeeting(),
  fields: {
    boardId: uuid({ required: true }),
    meetingDate: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
    kind: choice({ required: true }),
    location: text({ max: 200 }),
    startsAt: startTime,
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Meeting added to the calendar.' })
    expect(written).toEqual(['audit_log', 'board_meetings'])
    const rows = await db
      .select({
        boardId: boardMeetings.boardId,
        meetingDate: boardMeetings.meetingDate,
        kind: boardMeetings.kind,
        location: boardMeetings.location,
        startsAtMinute: boardMeetings.startsAtMinute,
      })
      .from(boardMeetings)
      .where(eq(boardMeetings.meetingDate, String(input.meetingDate)))
    expect(rows).toEqual([
      {
        boardId: zbaId,
        meetingDate: input.meetingDate,
        kind: 'regular',
        location: input.location,
        startsAtMinute: 1110,
      },
    ])
  },
})

describe('scheduleMeetingAction with the findings from the forms sweep', () => {
  it('refuses a meeting in the year 9999 beside the Date field and stores nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form(nextMeeting({ meetingDate: '9999-12-31' }))
    const { value, written } = await h.recordWrites(() => scheduleMeetingAction(form))
    expect({ value, written }).toEqual({
      value: refuseField(
        'meetingDate',
        'Enter the meeting date between January 1, 1900 and December 31, 2099.',
      ),
      written: [],
    })
  })

  it('refuses a 5000 character location beside the Location field', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form(nextMeeting({ location: 'x'.repeat(5000) }))
    const { value, written } = await h.recordWrites(() => scheduleMeetingAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('location', 'Enter a location of 200 characters or fewer.'),
      written: [],
    })
  })

  it('reports success, not an error, when the same meeting is submitted twice', async () => {
    h.signIn(await h.actorFor('admin'))
    const input = nextMeeting({ meetingDate: '2032-05-05', location: 'Library' })
    const first = await scheduleMeetingAction(h.form(input))
    const { value: second, written } = await h.recordWrites(() =>
      scheduleMeetingAction(h.form(input)),
    )
    expect(first).toEqual({ ok: true, message: 'Meeting added to the calendar.' })
    expect({ second, written }).toEqual({
      second: { ok: true, message: 'That meeting is already on the calendar.' },
      written: [],
    })
    const [rows] = await h.db
      .select({ n: count() })
      .from(boardMeetings)
      .where(eq(boardMeetings.meetingDate, '2032-05-05'))
    expect(rows?.n).toBe(1)
  })

  it('stores the usual 7:00 PM start when the form sends no time', async () => {
    h.signIn(await h.actorFor('admin'))
    const input = nextMeeting({ meetingDate: '2032-07-07', startsAt: '' })
    expect(await scheduleMeetingAction(h.form(input))).toEqual({
      ok: true,
      message: 'Meeting added to the calendar.',
    })
    const [row] = await h.db
      .select({ startsAtMinute: boardMeetings.startsAtMinute })
      .from(boardMeetings)
      .where(eq(boardMeetings.meetingDate, '2032-07-07'))
    expect(row?.startsAtMinute).toBe(1140)
  })

  it('still refuses a different meeting that lands on a taken date and kind', async () => {
    h.signIn(await h.actorFor('admin'))
    const input = nextMeeting({ meetingDate: '2032-06-06', location: 'Library' })
    await scheduleMeetingAction(h.form(input))
    const clash = await scheduleMeetingAction(h.form({ ...input, location: 'Town Hall' }))
    expect(clash).toEqual(refuseField('meetingDate', 'That meeting is already on the calendar.'))
  })
})

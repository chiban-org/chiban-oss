import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { agendas, boardMeetings } from '@/db/schema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { boardIdOf } from '@/test/boardFixtures'
import {
  actionHarness,
  describeActionCases,
  type FieldSpec,
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

const { updateMeetingAction } = await import('./editActions')

const h = actionHarness()

let meetingId = ''
let day = 0

async function newMeeting(): Promise<string> {
  day += 1
  const made = await scheduleMeeting(
    h.db,
    await h.actorFor('admin'),
    {
      boardId: await boardIdOf(h.db, 'zba'),
      meetingDate: `2033-02-${String(day).padStart(2, '0')}` as CivilDate,
      kind: 'special',
      location: 'Town Hall',
    },
    new AbortController().signal,
  )
  if (!made.ok) throw new Error(made.error)
  return made.value.meetingId
}

beforeAll(async () => {
  meetingId = await newMeeting()
})

const startTime: FieldSpec = {
  required: false,
  variants: [{ kind: 'words', label: 'as words', value: 'noon' }],
}

function refusalFor(variant: InvalidVariant) {
  switch (variant.field) {
    case 'meetingId':
      return refuseField('meetingId', idMessage('a meeting'))
    case 'startsAt':
      return refuseField('startsAt', 'Enter the start time as a time of day, like 7:00 PM.')
    default:
      return refuseField('location', textMessage('a location', 200, variant))
  }
}

describeActionCases(h, 'updateMeetingAction', {
  invoke: updateMeetingAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ meetingId, startsAt: '18:00', location: 'Library' }),
  fields: {
    meetingId: uuid({ required: true }),
    startsAt: startTime,
    location: text({ max: 200 }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Meeting updated.' })
    expect(written).toEqual(['audit_log', 'board_meetings'])
    const [row] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
    expect({ minute: row?.startsAtMinute, location: row?.location }).toEqual({
      minute: 1080,
      location: 'Library',
    })
  },
})

describe('updateMeetingAction messages', () => {
  it('says the meeting was updated when only the place changes', async () => {
    h.signIn(await h.actorFor('admin'))
    const id = await newMeeting()
    expect(
      await updateMeetingAction(h.form({ meetingId: id, startsAt: '19:00', location: 'Library' })),
    ).toEqual({
      ok: true,
      message: 'Meeting updated.',
    })
  })

  it('tells staff to show the agenda again after a time change sends it back to draft', async () => {
    h.signIn(await h.actorFor('admin'))
    const id = await newMeeting()
    await h.db.insert(agendas).values({ meetingId: id, status: 'published', revision: 1 })
    expect(
      await updateMeetingAction(h.form({ meetingId: id, startsAt: '18:30', location: '' })),
    ).toEqual({
      ok: true,
      message:
        'Meeting updated. The agenda went back to draft. Show it on the public site again so it lists the new time.',
    })
  })
})

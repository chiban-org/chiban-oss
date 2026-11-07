import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import { boardMeetings, boards } from '@/db/schema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { actionHarness } from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { addBoardAction, renameBoardAction, archiveBoardAction } = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal

async function addConservation(name = 'Alder Pond Conservation Commission') {
  h.signIn(await h.actorFor('admin'))
  const added = await addBoardAction(
    h.form({ name, shortName: 'Conservation Commission', kind: 'conservation_commission' }),
  )
  const [row] = await h.db.select().from(boards).where(eq(boards.name, name))
  return { added, id: row?.id ?? '' }
}

describe('board settings actions', () => {
  it('adds a board and refuses a second Planning Board on the kind field', async () => {
    const { added, id } = await addConservation()
    expect(added).toEqual({ ok: true, message: 'Alder Pond Conservation Commission added.' })
    expect(id).not.toBe('')
    const second = await addBoardAction(
      h.form({ name: 'Another PB', shortName: 'PB', kind: 'planning_board' }),
    )
    expect(second).toEqual({
      ok: false,
      error: 'The town already has an active board of this kind.',
      fieldErrors: { kind: 'The town already has an active board of this kind.' },
    })
  })

  it('renames a board', async () => {
    const { id } = await addConservation('Rename Me Commission')
    const saved = await renameBoardAction(
      h.form({ boardId: id, name: 'Renamed Commission', shortName: 'Renamed' }),
    )
    expect(saved).toEqual({ ok: true, message: 'Board saved.' })
  })

  it('says why archiving is refused before the confirmation and again on submit, then archives', async () => {
    const { id } = await addConservation('Archive Me Commission')
    const made = await scheduleMeeting(
      h.db,
      await h.actorFor('staff'),
      { boardId: id, meetingDate: '2099-05-01' as CivilDate, kind: 'regular' },
      signal,
    )
    if (!made.ok) throw new Error('schedule failed')
    const reason =
      'Archive Me Commission cannot be archived yet. It has 1 scheduled meeting ahead. Cancel it first.'
    const check = h.form({ boardId: id, [CHECK_ONLY_FIELD]: '1' })
    expect(await archiveBoardAction(check)).toEqual({ ok: false, error: reason })
    expect(await archiveBoardAction(h.form({ boardId: id }))).toEqual({ ok: false, error: reason })
    await h.db
      .update(boardMeetings)
      .set({ status: 'cancelled', cancelReason: 'No quorum' })
      .where(eq(boardMeetings.id, made.value.meetingId))
    const done = await archiveBoardAction(h.form({ boardId: id }))
    expect(done).toEqual({ ok: true, message: 'Archive Me Commission archived.' })
  })
})

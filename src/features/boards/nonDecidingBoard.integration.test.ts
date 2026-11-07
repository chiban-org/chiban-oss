import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addAgendaItem, publishAgenda } from '@/features/agendas/agendas'
import { createBoard } from '@/features/boards/boardAdmin'
import { scheduleMeeting } from '@/features/boards/meetings'
import { recordMinutes } from '@/features/boards/minutes'
import { loadMeetingMinutes } from '@/features/boards/minutesView'
import { agendaStatusText, loadMeetingView } from '@/features/hearings/meetingView'
import { loadPublicBoardRecords } from '@/features/hearings/publicRecords'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let boardId = ''
let meetingId = ''

async function meetingOn(date: string): Promise<string> {
  const made = await scheduleMeeting(
    handle.db,
    world.staff,
    { boardId, meetingDate: date as CivilDate, kind: 'regular', location: 'Library' },
    signal,
  )
  if (!made.ok) throw new Error(`schedule failed: ${made.error}`)
  return made.value.meetingId
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {})
  const made = await createBoard(
    handle.db,
    world.admin,
    {
      name: 'Alder Pond Conservation Commission',
      shortName: 'Conservation Commission',
      kind: 'conservation_commission',
    },
    signal,
  )
  if (!made.ok) throw new Error('create failed')
  boardId = made.value.boardId
  meetingId = await meetingOn('2028-02-10')
})
afterEach(async () => {
  await handle.drop()
})

describe('a board that does not decide applications', () => {
  it('shows its meeting view with the board name', async () => {
    const view = await loadMeetingView(handle.db, world.staff, meetingId, signal)
    expect(view).toMatchObject({
      boardId,
      boardName: 'Alder Pond Conservation Commission',
      hearings: [],
    })
  })

  it('publishes an agenda of business items that appears on the public meetings page', async () => {
    const { store } = await makeTestStore()
    const item = await addAgendaItem(
      handle.db,
      world.staff,
      { meetingId, kind: 'business', title: 'Trail easement update' },
      signal,
    )
    expect(item.ok).toBe(true)
    const published = await publishAgenda(handle.db, store, world.staff, meetingId, signal)
    expect(published.ok).toBe(true)
    const view = await loadMeetingView(handle.db, world.staff, meetingId, signal)
    expect(view?.agenda?.items[0]?.line).toBe('Business: Trail easement update')
    expect(
      view?.agenda === null || view?.agenda === undefined ? '' : agendaStatusText(view.agenda),
    ).toMatch(/^Shown on the public site/)
    const records = await loadPublicBoardRecords(handle.db, signal)
    expect(records.agendas.map((a) => a.text)).toEqual([
      'Conservation Commission, February 10, 2028',
    ])
  })

  it('posts approved minutes on the public meetings page under its short name', async () => {
    const { store } = await makeTestStore()
    const past = await meetingOn('2027-12-09')
    const made = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'meeting', id: past },
      pdfBytes('Minutes'),
      { title: 'Minutes', filename: 'minutes.pdf' },
    )
    const recorded = await recordMinutes(
      handle.db,
      world.staff,
      {
        meetingId: past,
        documentId: made.documentId,
        status: 'approved',
        approvedOn: '2027-12-20' as CivilDate,
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(recorded.ok).toBe(true)
    const view = await loadMeetingMinutes(handle.db, past, signal, BOARD_FIXTURE_NOW)
    expect(view.current).toMatchObject({ status: 'approved' })
    const records = await loadPublicBoardRecords(handle.db, signal)
    expect(records.minutes.map((m) => m.text)).toEqual([
      'Conservation Commission, December 9, 2027, approved December 20, 2027',
    ])
  })
})

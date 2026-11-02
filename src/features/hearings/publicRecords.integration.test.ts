import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agendas, files } from '@/db/schema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { attachDocument } from '@/features/documents/attach'
import { loadPublicBoardRecords } from '@/features/hearings/publicRecords'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { pbMeetings: [] })
})
afterEach(async () => {
  await handle.drop()
})

async function publishedAgendas(count: number, privateCount = 0) {
  for (let i = 0; i < count + privateCount; i += 1) {
    const made = await scheduleMeeting(
      handle.db,
      world.staff,
      {
        board: 'planning_board',
        meetingDate: addDays('2027-01-06' as CivilDate, i * 7),
        kind: 'regular',
      },
      signal,
    )
    if (!made.ok) throw new Error('meeting')
    const sha256 = randomUUID().replaceAll('-', '').padEnd(64, '0')
    await handle.db.insert(files).values({
      sha256,
      sizeBytes: 10,
      contentType: 'application/pdf',
      storageKey: `blobs/${sha256}`,
    })
    const attached = await handle.db.transaction((tx) =>
      attachDocument(
        tx,
        world.staff,
        {
          target: { kind: 'meeting', id: made.value.meetingId },
          title: 'Agenda',
          docKind: 'board_material',
          file: { sha256, filename: 'agenda.pdf', contentType: 'application/pdf' },
          audiences: ['board'],
          isPublic: i < count,
        },
        signal,
      ),
    )
    await handle.db.insert(agendas).values({
      meetingId: made.value.meetingId,
      status: 'published',
      revision: 1,
      publishedAt: new Date(),
      documentId: attached.documentId,
    })
  }
}

describe('public agendas', () => {
  it('25 published agendas show 20 on the first page and 5 on the second', async () => {
    await publishedAgendas(25)
    const first = await loadPublicBoardRecords(handle.db, signal, { agendaPage: 1 })
    const second = await loadPublicBoardRecords(handle.db, signal, { agendaPage: 2 })
    expect([first.agendas.length, second.agendas.length]).toEqual([20, 5])
    expect(first.agendas[0]?.text).toBe('Planning Board, June 23, 2027')
    expect(first).toMatchObject({ agendaPage: { page: 1, hasNext: true } })
    expect(second).toMatchObject({ agendaPage: { page: 2, hasNext: false } })
  })

  it('agendas that are not public do not use up the page', async () => {
    await publishedAgendas(20, 3)
    const first = await loadPublicBoardRecords(handle.db, signal, { agendaPage: 1 })
    expect(first.agendas.length).toBe(20)
    expect(first).toMatchObject({ agendaPage: { page: 1, hasNext: false } })
  })
})

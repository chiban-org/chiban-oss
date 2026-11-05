import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addAgendaItem, publishAgenda } from '@/features/agendas/agendas'
import { loadActor } from '@/features/auth/actor'
import { scheduleMeeting } from '@/features/boards/meetings'
import { getMemberPacket, listMemberMeetings } from '@/features/boards/memberPackets'
import { inviteBoardMember } from '@/features/boards/members'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { createPacket } from '@/features/boards/packets'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const DATE = '2027-04-15' as CivilDate
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: [DATE] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function publishedMeeting(kind: 'regular' | 'special') {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) => and(equals(m.board, 'zba'), equals(m.kind, kind)),
  })
  const meetingId = rows[0]?.id ?? ''
  await addAgendaItem(
    handle.db,
    world.staff,
    { meetingId, kind: 'other', title: 'Business' },
    signal,
  )
  const published = await publishAgenda(handle.db, store, world.staff, meetingId, signal)
  if (!published.ok) throw new Error(published.error)
  return { meetingId, documentId: published.value.documentId }
}

async function zbaMember() {
  const invited = await inviteBoardMember(
    handle.db,
    createMemoryTransport(),
    world.staff,
    {
      email: 'zba.member@alderpond.example',
      displayName: 'Member',
      board: 'zba',
      title: 'member',
      termStart: '2020-01-01' as CivilDate,
    },
    signal,
  )
  if (!invited.ok) throw new Error(invited.error)
  const actor = await loadActor(handle.db, invited.value.userId, signal)
  if (actor === null) throw new Error('no actor')
  return actor
}

describe('member packets follow the meeting a packet was made for', () => {
  it('a packet for a special meeting does not show on the regular meeting the same day', async () => {
    const made = await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'zba', meetingDate: DATE, kind: 'special' },
      signal,
    )
    expect(made.ok).toBe(true)
    const regular = await publishedMeeting('regular')
    const special = await publishedMeeting('special')
    const packet = await createPacket(
      handle.db,
      world.staff,
      {
        title: 'Special meeting packet',
        meetingId: special.meetingId,
        documentIds: [special.documentId],
      },
      signal,
    )
    if (!packet.ok) throw new Error(JSON.stringify(packet.error))
    const member = await zbaMember()
    await sendPacketToBoard(
      handle.db,
      createMemoryTransport(),
      world.staff,
      { packetId: packet.value.packetId },
      signal,
    )
    const list = await listMemberMeetings(handle.db, member, { limit: 25 }, signal)
    const hasPacket = new Map(list.rows.map((r) => [r.meetingId, r.hasPacket]))
    expect(hasPacket.get(special.meetingId)).toBe(true)
    expect(hasPacket.get(regular.meetingId)).toBe(false)
    expect((await getMemberPacket(handle.db, member, special.meetingId, signal)).ok).toBe(true)
    expect(await getMemberPacket(handle.db, member, regular.meetingId, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})

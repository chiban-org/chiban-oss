import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agendaBlocks } from '@/features/agendas/agendaPdf'
import { buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { createMeetingPacket } from '@/features/agendas/meetingPacket'
import { agendaStatusText, loadMeetingView } from '@/features/hearings/meetingView'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

describe('the meeting agenda', () => {
  it('names a hearing item once and dates the publication', async () => {
    const { store } = await makeTestStore()
    const made = await decidedZba(handle.db, world, store, { documents: false })
    await buildAgenda(handle.db, world.staff, made.meetingId, signal)
    expect(await buildAgenda(handle.db, world.staff, made.meetingId, signal)).toEqual({
      ok: true,
      value: { added: 0, onMeeting: 1 },
    })
    await publishAgenda(handle.db, store, world.staff, made.meetingId, signal)
    const view = await loadMeetingView(handle.db, world.staff, made.meetingId, signal)
    expect(view?.agenda?.items[0]?.line).toMatch(/^Public hearing: VAR VAR-\d{4}-\d{4}$/)
    expect(
      view?.agenda === null || view?.agenda === undefined ? '' : agendaStatusText(view.agenda),
    ).toMatch(/^Published on the public site on [A-Z][a-z]+ \d{1,2}, \d{4}\. Revision 1\.$/)
  })

  it('offers the packet once and then links to the one made', async () => {
    const { store } = await makeTestStore()
    const made = await decidedZba(handle.db, world, store, { documents: false })
    await buildAgenda(handle.db, world.staff, made.meetingId, signal)
    await publishAgenda(handle.db, store, world.staff, made.meetingId, signal)
    const before = await loadMeetingView(handle.db, world.staff, made.meetingId, signal)
    expect(before?.packetId).toBeNull()
    expect(before?.canManagePackets).toBe(true)
    const packet = await createMeetingPacket(handle.db, store, world.staff, made.meetingId, signal)
    if (!packet.ok) throw new Error(JSON.stringify(packet.error))
    const after = await loadMeetingView(handle.db, world.staff, made.meetingId, signal)
    expect(after?.packetId).toBe(packet.value.packetId)
  })

  it('agenda details lines are tied to their item without repeating the number', () => {
    const blocks = agendaBlocks({
      boardName: 'Zoning Board of Adjustment',
      meetingDate: 'April 15, 2027',
      location: 'Town Hall',
      time: '7:00 PM',
      items: [
        {
          position: 0,
          kind: 'minutes_approval',
          title: 'Minutes',
          description: '',
          application: null,
        },
        {
          position: 1,
          kind: 'business',
          title: 'Old business',
          description: 'Signage update',
          application: null,
        },
      ],
    })
    expect(blocks).toContainEqual({ kind: 'paragraph', text: 'Item 2 details: Signage update' })
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { savePacket } from '@/features/boards/packetSave'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { filterPacketRows, readPacketsFilter } from '@/features/boards/packetsFilter'
import { loadPacketsIndex } from '@/features/boards/packetsIndex'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { loadPacketsSection } from '@/features/staffHome/packetsHome'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeContextFor, rowCount, rowHref, searchOf } from '@/test/homeFixtures'
import { makeTestStore } from '@/test/minio'
import { type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'

const signal = new AbortController().signal
const UNSENT = 'Packets for upcoming meetings not sent yet'
const NOW = new Date('2027-04-01T15:00:00Z')
const MEETING_EVENING_IN_TOWN = new Date('2027-04-16T02:00:00Z')
let handle: TestDb
let store: ObjectStore
let flow: PacketFlow

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  flow = await packetFlow(handle.db, store)
})
afterEach(async () => {
  await handle.drop()
})

async function pageRows(href: string, now: Date) {
  const index = await loadPacketsIndex(handle.db, flow.world.staff, signal, now)
  if (!index.ok) throw new Error(index.error)
  return filterPacketRows(index.value.meetings, readPacketsFilter(searchOf(href)))
}

async function sendFlowPacket() {
  const saved = await savePacket(
    handle.db,
    store,
    flow.world.staff,
    { meetingId: flow.meetingId, documentIds: [flow.agendaDocumentId], trcApplicationIds: [] },
    signal,
  )
  if (!saved.ok) throw new Error(JSON.stringify(saved.error))
  await sendPacketToBoard(
    handle.db,
    createMemoryTransport(),
    flow.world.staff,
    { packetId: saved.value.packetId },
    signal,
  )
}

describe('the Board packets card on Today', () => {
  it('counts the upcoming packets not sent yet and links to the list showing only those', async () => {
    const section = await loadPacketsSection(await homeContextFor(handle.db, flow.world.staff, NOW))
    const href = rowHref(section, UNSENT)
    const rows = await pageRows(href, NOW)
    expect(rows.map((r) => r.meetingId)).toEqual([flow.meetingId])
    expect(rowCount(section, UNSENT)).toBe(rows.length)
    const all = await loadPacketsIndex(handle.db, flow.world.staff, signal, NOW)
    expect(all.ok && all.value.meetings.length).toBeGreaterThan(rows.length)
  })

  it('stops counting a packet once it is sent', async () => {
    await sendFlowPacket()
    const section = await loadPacketsSection(await homeContextFor(handle.db, flow.world.staff, NOW))
    expect(rowCount(section, UNSENT)).toBe(0)
    expect(await pageRows(rowHref(section, UNSENT), NOW)).toEqual([])
  })

  it('still counts the meeting on its evening in the town, after midnight UTC', async () => {
    const ctx = await homeContextFor(handle.db, flow.world.staff, MEETING_EVENING_IN_TOWN)
    expect(ctx.today).toBe('2027-04-15')
    const section = await loadPacketsSection(ctx)
    expect(rowCount(section, UNSENT)).toBe(1)
    expect(await pageRows(rowHref(section, UNSENT), MEETING_EVENING_IN_TOWN)).toHaveLength(1)
  })

  it('is absent for a viewer who cannot manage packets', async () => {
    const ctx = await homeContextFor(handle.db, flow.world.reviewer, NOW)
    expect(await loadPacketsSection(ctx)).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { savePacket } from '@/features/boards/packetSave'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { loadPacketsIndex } from '@/features/boards/packetsIndex'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-04-01T15:00:00Z')
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

describe('board packets index', () => {
  it('lists each upcoming meeting with its packet state and a link to its packet section', async () => {
    const before = await loadPacketsIndex(handle.db, flow.world.staff, signal, NOW)
    if (!before.ok) throw new Error(before.error)
    const row = before.value.find((r) => r.meetingId === flow.meetingId)
    expect(row).toMatchObject({
      state: 'Not sent yet',
      href: `/staff/boards/meetings/${flow.meetingId}#packet`,
    })
    expect(before.value.every((r) => r.meetingDate >= '2027-04-01')).toBe(true)
    const others = before.value.filter((r) => r.meetingId !== flow.meetingId)
    expect(others.every((r) => r.state === 'Publish the agenda to start the packet')).toBe(true)
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
    const after = await loadPacketsIndex(handle.db, flow.world.staff, signal, NOW)
    const sent = after.ok ? after.value.find((r) => r.meetingId === flow.meetingId) : undefined
    expect(sent?.state).toMatch(/^Sent to 6 members on /)
  })

  it('refuses a viewer who cannot manage packets', async () => {
    expect(await loadPacketsIndex(handle.db, flow.world.reviewer, signal, NOW)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardMeetings, boardPackets } from '@/db/schema'
import { createPacket } from '@/features/boards/packets'
import { setAudiences } from '@/features/documents/publish'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { packetMeeting } from '@/test/packetFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function boardDocument(): Promise<string> {
  const appRef = {
    kind: 'application' as const,
    id: (await makeApplication(handle.db, world)).applicationId,
  }
  const up = await uploadAs(
    handle.db,
    store,
    world.applicant,
    appRef,
    pdfBytes(`plan ${Math.random()}`),
    {
      title: 'Site plan',
    },
  )
  await setAudiences(
    handle.db,
    world.staff,
    { documentId: up.documentId, audiences: ['board'] },
    signal,
  )
  return up.documentId
}

async function make(meetingId: string, documentIds: string[]) {
  return await createPacket(
    handle.db,
    world.staff,
    { title: 'April', meetingId, documentIds },
    signal,
  )
}

describe('a packet belongs to a scheduled meeting', () => {
  it('takes its board and date from the meeting it is made for', async () => {
    const meetingId = await packetMeeting(handle.db, 'zba', '2027-04-15')
    const made = await make(meetingId, [await boardDocument()])
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    const [row] = await handle.db
      .select()
      .from(boardPackets)
      .where(eq(boardPackets.id, made.value.packetId))
    expect(row).toMatchObject({ meetingId, board: 'zba', meetingDate: '2027-04-15' })
  })

  it('refuses a meeting that is not on the calendar', async () => {
    expect(await make('00000000-0000-4000-8000-000000000000', [await boardDocument()])).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('refuses a cancelled meeting', async () => {
    const meetingId = await packetMeeting(handle.db, 'zba', '2027-04-15')
    await handle.db
      .update(boardMeetings)
      .set({ status: 'cancelled', cancelReason: 'Snow' })
      .where(eq(boardMeetings.id, meetingId))
    expect(await make(meetingId, [await boardDocument()])).toEqual({
      ok: false,
      error: 'meeting_cancelled',
    })
  })

  it('makes one packet per meeting', async () => {
    const meetingId = await packetMeeting(handle.db, 'zba', '2027-04-15')
    const documentId = await boardDocument()
    expect((await make(meetingId, [documentId])).ok).toBe(true)
    expect(await make(meetingId, [documentId])).toEqual({ ok: false, error: 'packet_exists' })
    expect(await handle.db.select().from(boardPackets)).toHaveLength(1)
  })
})

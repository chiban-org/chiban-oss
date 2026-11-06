import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPacket } from '@/features/boards/packets'
import { setAudiences } from '@/features/documents/publish'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { packetMeeting } from '@/test/packetFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const MEETING = '2027-04-15' as CivilDate
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function boardDocument(applicationId: string, title: string): Promise<string> {
  const up = await uploadAs(
    handle.db,
    store,
    world.applicant,
    { kind: 'application', id: applicationId },
    pdfBytes(`${title} ${Math.random()}`),
    { title },
  )
  await setAudiences(
    handle.db,
    world.staff,
    { documentId: up.documentId, audiences: ['board'] },
    signal,
  )
  return up.documentId
}

describe('packet board check', () => {
  it('a zoning board document cannot go into a planning board packet', async () => {
    const variance = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    const documentId = await boardDocument(variance, 'Site plan')
    const made = await createPacket(
      handle.db,
      world.staff,
      {
        title: 'April',
        meetingId: await packetMeeting(handle.db, 'planning_board', MEETING),
        documentIds: [documentId],
      },
      signal,
    )
    expect(made).toEqual({ ok: false, error: { notForBoard: [documentId] } })
  })
})

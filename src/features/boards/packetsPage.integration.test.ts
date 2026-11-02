import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inviteBoardMember } from '@/features/boards/members'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket, eligibleBoardDocuments } from '@/features/boards/packets'
import { loadPacketsPage } from '@/features/boards/packetsPage'
import { setAudiences } from '@/features/documents/publish'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
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

describe('packet document chooser', () => {
  it('lists only board application documents, named with the application and board', async () => {
    const variance = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await boardDocument(variance, 'Site plan')
    const permit = (await makeApplication(handle.db, world)).applicationId
    await boardDocument(permit, 'Panel schedule')
    const chosen = await eligibleBoardDocuments(handle.db, world.staff, signal)
    const labels = chosen.ok ? chosen.value.map((d) => d.label) : []
    expect(labels).toHaveLength(1)
    expect(labels[0]).toMatch(/^VAR-\d{4}-\d{4}: Site plan, Zoning Board of Adjustment$/)
  })

  it('a zoning board document cannot go into a planning board packet', async () => {
    const variance = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    const documentId = await boardDocument(variance, 'Site plan')
    const made = await createPacket(
      handle.db,
      world.staff,
      { title: 'April', board: 'planning_board', meetingDate: MEETING, documentIds: [documentId] },
      signal,
    )
    expect(made).toEqual({ ok: false, error: { notForBoard: [documentId] } })
  })
})

describe('packets page', () => {
  it('names the board and lists a seated member who was notified', async () => {
    const variance = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    const documentId = await boardDocument(variance, 'Site plan')
    const mail = createMemoryTransport()
    await inviteBoardMember(
      handle.db,
      mail,
      world.staff,
      {
        email: 'drew@alderpond.example',
        displayName: 'Drew Hale',
        board: 'zba',
        title: 'member',
        termStart: '2020-01-01' as CivilDate,
      },
      signal,
    )
    const made = await createPacket(
      handle.db,
      world.staff,
      { title: 'April', board: 'zba', meetingDate: MEETING, documentIds: [documentId] },
      signal,
    )
    if (!made.ok) throw new Error('packet')
    await sendPacketLink(
      handle.db,
      mail,
      world.staff,
      {
        packetId: made.value.packetId,
        recipientName: 'Drew Hale',
        recipientEmail: 'drew@alderpond.example',
      },
      signal,
    )
    const page = await loadPacketsPage(handle.db, world.staff, signal)
    expect(page).toMatchObject({
      ok: true,
      value: {
        packets: [
          {
            heading: 'April',
            meeting: 'Zoning Board of Adjustment meeting, April 15, 2027',
            documents: ['Site plan'],
            notified: [expect.stringMatching(/^Drew Hale \(drew@alderpond\.example\), notified /)],
          },
        ],
      },
    })
  })
})

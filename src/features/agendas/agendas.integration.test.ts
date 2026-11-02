import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agendaItems, agendas, boardPacketItems, documents } from '@/db/schema'
import { agendaBlocks } from '@/features/agendas/agendaPdf'
import {
  addAgendaItem,
  buildAgenda,
  moveAgendaItem,
  publishAgenda,
  removeAgendaItem,
  reopenAgenda,
} from '@/features/agendas/agendas'
import { createMeetingPacket } from '@/features/agendas/meetingPacket'
import { listDocuments } from '@/features/documents/listDocuments'
import { scheduleHearing } from '@/features/hearings/hearings'
import { routeToTrc } from '@/features/reviews/trcRouting'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findRawKeys, findUuids } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'
import { issueListWithRecipients, proofDocument, recipient } from '@/test/noticeFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function zbaMeetingId() {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) =>
      and(equals(m.meetingDate, '2027-04-15'), equals(m.board, 'zba')),
  })
  return rows[0]?.id ?? ''
}

async function scheduled() {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const result = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: id, meetingId: await zbaMeetingId(), kind: 'public_hearing' },
    signal,
  )
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return { applicationId: id, hearingId: result.value.hearingId }
}

async function itemsOf(meetingId: string) {
  return await handle.db
    .select()
    .from(agendaItems)
    .where(eq(agendaItems.meetingId, meetingId))
    .orderBy(agendaItems.position)
}

describe('agenda builder', () => {
  it('agenda seeds one item per scheduled hearing in scheduling order', async () => {
    const first = await scheduled()
    const second = await scheduled()
    const meetingId = await zbaMeetingId()
    expect(await buildAgenda(handle.db, world.staff, meetingId, signal)).toEqual({
      ok: true,
      value: { added: 2, onMeeting: 2 },
    })
    const items = await itemsOf(meetingId)
    expect(items.map((i) => i.hearingId)).toEqual([first.hearingId, second.hearingId])
    expect(items.map((i) => i.position)).toEqual([0, 1])
    expect(items.every((i) => i.kind === 'hearing' && i.title !== '')).toBe(true)
  })

  it('building twice adds nothing', async () => {
    await scheduled()
    const meetingId = await zbaMeetingId()
    await buildAgenda(handle.db, world.staff, meetingId, signal)
    expect(await buildAgenda(handle.db, world.staff, meetingId, signal)).toEqual({
      ok: true,
      value: { added: 0, onMeeting: 1 },
    })
    expect(await itemsOf(meetingId)).toHaveLength(1)
  })

  it('a meeting with no scheduled or held hearing has none on it to add', async () => {
    const meetingId = await zbaMeetingId()
    expect(await buildAgenda(handle.db, world.staff, meetingId, signal)).toEqual({
      ok: true,
      value: { added: 0, onMeeting: 0 },
    })
  })

  it('items can be added, moved, and removed while the agenda is a draft', async () => {
    await scheduled()
    const meetingId = await zbaMeetingId()
    await buildAgenda(handle.db, world.staff, meetingId, signal)
    const added = await addAgendaItem(
      handle.db,
      world.staff,
      { meetingId, kind: 'minutes_approval', title: 'Approve the March minutes' },
      signal,
    )
    if (!added.ok) throw new Error('add failed')
    expect((await itemsOf(meetingId)).map((i) => i.kind)).toEqual(['hearing', 'minutes_approval'])
    await moveAgendaItem(
      handle.db,
      world.staff,
      { itemId: added.value.itemId, toPosition: 0 },
      signal,
    )
    expect((await itemsOf(meetingId)).map((i) => i.kind)).toEqual(['minutes_approval', 'hearing'])
    await removeAgendaItem(handle.db, world.staff, added.value.itemId, signal)
    expect((await itemsOf(meetingId)).map((i) => i.position)).toEqual([0])
  })

  it('a reviewer cannot build, add, or publish', async () => {
    await scheduled()
    const meetingId = await zbaMeetingId()
    expect(await buildAgenda(handle.db, world.reviewer, meetingId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await addAgendaItem(
        handle.db,
        world.reviewer,
        { meetingId, kind: 'other', title: 'x' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(await publishAgenda(handle.db, store, world.reviewer, meetingId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await handle.db.select().from(agendas)).toEqual([])
  })
})

describe('agenda publication', () => {
  async function publishedAgenda() {
    const scheduledHearing = await scheduled()
    const meetingId = await zbaMeetingId()
    await buildAgenda(handle.db, world.staff, meetingId, signal)
    const published = await publishAgenda(handle.db, store, world.staff, meetingId, signal)
    if (!published.ok) throw new Error(published.error)
    return { ...scheduledHearing, meetingId, documentId: published.value.documentId }
  }

  it('published agenda is a public meeting document', async () => {
    const { meetingId, documentId } = await publishedAgenda()
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, documentId))
    expect(doc).toMatchObject({ recordKind: 'meeting', recordId: meetingId, isPublic: true })
    const anonymous = await listDocuments(
      handle.db,
      null,
      { record: { kind: 'meeting', id: meetingId }, limit: 25 },
      signal,
    )
    expect(anonymous.rows.map((r) => r.documentId)).toEqual([documentId])
  })

  it('moving an item after publish is refused', async () => {
    const { meetingId } = await publishedAgenda()
    const [item] = await itemsOf(meetingId)
    expect(
      await moveAgendaItem(
        handle.db,
        world.staff,
        { itemId: item?.id ?? '', toPosition: 0 },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_draft' })
    expect(await buildAgenda(handle.db, world.staff, meetingId, signal)).toEqual({
      ok: false,
      error: 'not_draft',
    })
  })

  it('publishing twice is already_published', async () => {
    const { meetingId } = await publishedAgenda()
    expect(await publishAgenda(handle.db, store, world.staff, meetingId, signal)).toEqual({
      ok: false,
      error: 'already_published',
    })
  })

  it('an empty agenda cannot be published', async () => {
    await scheduled()
    const meetingId = await zbaMeetingId()
    await buildAgenda(handle.db, world.staff, meetingId, signal)
    const [item] = await itemsOf(meetingId)
    await removeAgendaItem(handle.db, world.staff, item?.id ?? '', signal)
    expect(await publishAgenda(handle.db, store, world.staff, meetingId, signal)).toEqual({
      ok: false,
      error: 'empty',
    })
  })

  it('republishing after a change makes a new document and unpublishes the old one', async () => {
    const { meetingId, documentId } = await publishedAgenda()
    expect((await reopenAgenda(handle.db, world.staff, meetingId, signal)).ok).toBe(true)
    await addAgendaItem(
      handle.db,
      world.staff,
      { meetingId, kind: 'business', title: 'Other business' },
      signal,
    )
    const again = await publishAgenda(handle.db, store, world.staff, meetingId, signal)
    if (!again.ok) throw new Error(again.error)
    expect(again.value.documentId).not.toBe(documentId)
    const [old] = await handle.db.select().from(documents).where(eq(documents.id, documentId))
    expect(old?.isPublic).toBe(false)
    const [row] = await handle.db.select().from(agendas).where(eq(agendas.meetingId, meetingId))
    expect(row).toMatchObject({
      status: 'published',
      revision: 2,
      documentId: again.value.documentId,
    })
  })
})

describe('agenda pdf', () => {
  it('agenda pdf lists the application number and site address', () => {
    const blocks = agendaBlocks({
      boardName: 'Alder Pond Zoning Board of Adjustment',
      meetingDate: 'April 15, 2027',
      location: 'Town Hall',
      time: '7:00 PM',
      items: [
        {
          position: 0,
          kind: 'hearing',
          title: 'Variance',
          description: '',
          application: {
            number: 'VAR-2027-0001',
            applicantName: 'Pat Heron',
            parcelDisplayId: '007-001-000',
            siteAddress: '12 Osprey Lane',
          },
        },
      ],
    })
    const text = JSON.stringify(blocks)
    expect(text).toContain('VAR-2027-0001')
    expect(text).toContain('12 Osprey Lane')
    expect(text).toContain('007-001-000')
    expect(text).toContain('Pat Heron')
    expect(text).toContain('7:00 PM')
    expect(text).toContain('Town Hall')
    expect(findIsoDates(text)).toEqual([])
    expect(findUuids(text)).toEqual([])
    expect(findRawKeys(text, ['public_hearing', 'minutes_approval'])).toEqual([])
  })
})

describe('meeting packet', () => {
  it('meeting packet contains only board-audience or public documents', async () => {
    const { applicationId } = await scheduled()
    const meetingId = await zbaMeetingId()
    await buildAgenda(handle.db, world.staff, meetingId, signal)
    await publishAgenda(handle.db, store, world.staff, meetingId, signal)
    const boardDoc = await proofDocument(handle.db, world, applicationId)
    const privateDoc = await proofDocument(handle.db, world, applicationId)
    await handle.db
      .update(documents)
      .set({ audiences: ['board'] })
      .where(eq(documents.id, boardDoc))
    await handle.db
      .update(documents)
      .set({ audiences: ['reviewers'] })
      .where(eq(documents.id, privateDoc))
    const packet = await createMeetingPacket(handle.db, store, world.staff, meetingId, signal)
    if (!packet.ok) throw new Error(JSON.stringify(packet.error))
    const items = await handle.db
      .select()
      .from(boardPacketItems)
      .where(eq(boardPacketItems.packetId, packet.value.packetId))
    const ids = items.map((i) => i.documentId)
    expect(ids).toContain(boardDoc)
    expect(ids).not.toContain(privateDoc)
    expect(items.length).toBe(packet.value.documents)
  })

  it('meeting packet includes the TRC summary of a routed application', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    await saveAndPublish(handle.db, world.admin, 'review_routes', 'default', {
      key: 'default',
      departments: [{ key: 'fire', label: 'Fire', reviewerUserIds: [reviewer.userId] }],
      routes: [
        {
          applicationTypeKey: world.zbaTypeKey,
          departmentKeys: ['fire'],
          commentDueDaysBeforeMeeting: 7,
        },
      ],
    })
    const { applicationId } = await scheduled()
    const meetingId = await zbaMeetingId()
    await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)
    await buildAgenda(handle.db, world.staff, meetingId, signal)
    const packet = await createMeetingPacket(handle.db, store, world.staff, meetingId, signal)
    if (!packet.ok) throw new Error(JSON.stringify(packet.error))
    const items = await handle.db
      .select({ title: documents.title })
      .from(boardPacketItems)
      .innerJoin(documents, eq(documents.id, boardPacketItems.documentId))
      .where(eq(boardPacketItems.packetId, packet.value.packetId))
    expect(items.map((i) => i.title)).toContain('Technical Review Committee summary')
  })

  it('a packet for a meeting with no agenda is empty', async () => {
    expect(
      await createMeetingPacket(handle.db, store, world.staff, await zbaMeetingId(), signal),
    ).toEqual({
      ok: false,
      error: 'empty',
    })
  })

  it('a reviewer cannot create a meeting packet', async () => {
    expect(
      await createMeetingPacket(handle.db, store, world.reviewer, await zbaMeetingId(), signal),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardPacketItems, boardPackets, documents } from '@/db/schema'
import { gatherPacket } from '@/features/boards/packetGather'
import { savePacket, shareWithBoard } from '@/features/boards/packetSave'
import { routeToTrc } from '@/features/reviews/trcRouting'
import type { ObjectStore } from '@/features/storage/objectStore'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { applicationDocument, type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
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

async function counts() {
  return {
    packets: (await handle.db.select().from(boardPackets)).length,
    items: (await handle.db.select().from(boardPacketItems)).length,
    documents: (await handle.db.select().from(documents)).length,
  }
}

async function gathered() {
  const view = await gatherPacket(handle.db, flow.world.staff, flow.meetingId, signal)
  if (!view.ok) throw new Error(view.error)
  return view.value
}

async function threeDocuments() {
  return {
    shared: await applicationDocument(handle.db, store, flow, {
      title: 'Variance plan',
      audiences: ['board'],
    }),
    unshared: await applicationDocument(handle.db, store, flow, {
      title: 'Abutter letter',
      audiences: ['reviewers'],
    }),
    publicOnly: await applicationDocument(handle.db, store, flow, {
      title: 'Photo',
      audiences: [],
      isPublic: true,
    }),
  }
}

describe('gathering a packet', () => {
  it('lists candidates by agenda item with the reason each excluded one is out, and creates nothing', async () => {
    const docs = await threeDocuments()
    const before = await counts()
    const view = await gathered()
    expect(await counts()).toEqual(before)
    expect(view.packetId).toBeNull()
    expect(view.title).toBe('Alder Pond Zoning Board of Adjustment packet, April 15, 2027')
    const [meeting, hearing] = view.groups
    expect(meeting?.heading).toBe('Meeting')
    expect(meeting?.candidates.map((c) => [c.documentId, c.checked])).toEqual([
      [flow.agendaDocumentId, true],
    ])
    expect(hearing?.applicationId).toBe(flow.applicationId)
    expect(hearing?.trc).toBe('none')
    const byId = new Map(hearing?.candidates.map((c) => [c.documentId, c]))
    expect(byId.get(docs.shared)).toMatchObject({ checked: true, exclusion: null })
    expect(byId.get(docs.unshared)).toMatchObject({
      checked: false,
      exclusion: { kind: 'not_shared' },
    })
    expect(byId.get(docs.publicOnly)).toMatchObject({
      checked: false,
      exclusion: { kind: 'no_public_copy' },
    })
  })

  it('saves exactly the checked documents under the prefilled title', async () => {
    const docs = await threeDocuments()
    const saved = await savePacket(
      handle.db,
      store,
      flow.world.staff,
      { meetingId: flow.meetingId, documentIds: [docs.shared], trcApplicationIds: [] },
      signal,
    )
    if (!saved.ok) throw new Error(JSON.stringify(saved.error))
    const [packet] = await handle.db.select().from(boardPackets)
    expect(packet).toMatchObject({
      title: 'Alder Pond Zoning Board of Adjustment packet, April 15, 2027',
      sentAt: null,
    })
    const items = await handle.db.select().from(boardPacketItems)
    expect(items.map((i) => i.documentId)).toEqual([docs.shared])
    const view = await gathered()
    expect(view.packetId).toBe(packet?.id)
    expect(view.groups[0]?.candidates[0]?.checked).toBe(false)
  })

  it('refuses a document that cannot go in the packet', async () => {
    const docs = await threeDocuments()
    expect(
      await savePacket(
        handle.db,
        store,
        flow.world.staff,
        { meetingId: flow.meetingId, documentIds: [docs.unshared], trcApplicationIds: [] },
        signal,
      ),
    ).toEqual({ ok: false, error: { notForBoard: [docs.unshared] } })
    expect((await counts()).packets).toBe(0)
  })

  it('shares a document with the board so it can be checked', async () => {
    const docs = await threeDocuments()
    const shared = await shareWithBoard(
      handle.db,
      flow.world.staff,
      { documentId: docs.unshared },
      signal,
    )
    expect(shared.ok).toBe(true)
    const view = await gathered()
    const candidate = view.groups[1]?.candidates.find((c) => c.documentId === docs.unshared)
    expect(candidate?.exclusion).toBeNull()
  })

  it('makes a TRC summary only when asked and only for an application with a TRC review', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    await saveAndPublish(handle.db, flow.world.admin, 'review_routes', 'default', {
      key: 'default',
      departments: [{ key: 'fire', label: 'Fire', reviewerUserIds: [reviewer.userId] }],
      routes: [
        {
          applicationTypeKey: flow.world.zbaTypeKey,
          departmentKeys: ['fire'],
          commentDueDaysBeforeMeeting: 7,
        },
      ],
    })
    await routeToTrc(
      handle.db,
      flow.world.staff,
      { applicationId: flow.applicationId, meetingId: flow.meetingId },
      signal,
    )
    expect((await gathered()).groups[1]?.trc).toBe('make')
    const before = (await counts()).documents
    const saved = await savePacket(
      handle.db,
      store,
      flow.world.staff,
      {
        meetingId: flow.meetingId,
        documentIds: [flow.agendaDocumentId],
        trcApplicationIds: [flow.applicationId],
      },
      signal,
    )
    expect(saved.ok).toBe(true)
    expect((await counts()).documents).toBe(before + 1)
    const view = await gathered()
    expect(view.groups[1]?.trc).toBe('made')
    expect(
      view.groups[1]?.candidates
        .filter((c) => c.title === 'Technical Review Committee summary')
        .map((c) => c.checked),
    ).toEqual([true])
  })

  it('refuses a viewer who cannot manage packets', async () => {
    expect(await gatherPacket(handle.db, flow.world.reviewer, flow.meetingId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await savePacket(
        handle.db,
        store,
        flow.world.reviewer,
        { meetingId: flow.meetingId, documentIds: [flow.agendaDocumentId], trcApplicationIds: [] },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

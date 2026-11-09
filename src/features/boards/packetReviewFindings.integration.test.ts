import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  boardMeetings,
  boardMemberships,
  boardPacketItems,
  boardPackets,
  documentVersions,
  renditionApprovals,
  users,
} from '@/db/schema'
import { publishAgenda, reopenAgenda } from '@/features/agendas/agendas'
import { endMembership } from '@/features/boards/members'
import { packetCandidates } from '@/features/boards/packetCandidates'
import { pendingChanges } from '@/features/boards/packetChanges'
import { packetItemRows, readerItems } from '@/features/boards/packetContents'
import { gatherPacket } from '@/features/boards/packetGather'
import { openPacket, sendPacketLink } from '@/features/boards/packetLinks'
import { savePacket } from '@/features/boards/packetSave'
import { applySelection } from '@/features/boards/packetSelection'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { legacyPacketPage, loadPacketsIndex } from '@/features/boards/packetsIndex'
import { sendPacketUpdate } from '@/features/boards/packetUpdate'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { MailTransport } from '@/features/mail/transport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { boardIdOf, boardIdSql } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { applicationDocument, type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'
import { approvePublic } from '@/test/renditionFixtures'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let flow: PacketFlow
let mail: MemoryMailTransport

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  flow = await packetFlow(handle.db, store)
  mail = createMemoryTransport()
})
afterEach(async () => {
  await handle.drop()
})

async function save(documentIds: string[]): Promise<string> {
  const result = await savePacket(
    handle.db,
    store,
    flow.world.staff,
    { meetingId: flow.meetingId, documentIds, trcApplicationIds: [] },
    signal,
  )
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value.packetId
}

async function sent(documentIds: string[]): Promise<string> {
  const packetId = await save(documentIds)
  await sendPacketToBoard(handle.db, mail, flow.world.staff, { packetId }, signal)
  return packetId
}

async function readers(packetId: string) {
  const [packet] = await handle.db.select().from(boardPackets).where(eq(boardPackets.id, packetId))
  if (packet === undefined) throw new Error('no packet')
  return readerItems(await packetItemRows(handle.db, packetId), packet)
}

const plan = async (title: string) =>
  await applicationDocument(handle.db, store, flow, { title, audiences: ['board'] })

describe('findings from the packet review', () => {
  it('does not put a public copy in the packet once its approval is revoked', async () => {
    const photo = await applicationDocument(handle.db, store, flow, {
      title: 'Photo',
      audiences: [],
      isPublic: true,
    })
    const [version] = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, photo))
    await approvePublic(handle.db, flow.world.staff, version?.id ?? '', store)
    const packetId = await save([flow.agendaDocumentId])
    const meeting = { id: flow.meetingId, boardId: await boardIdOf(handle.db, 'zba') }
    const stale = await packetCandidates(handle.db, meeting, flow.agendaDocumentId, signal)
    await handle.db.update(renditionApprovals).set({ revokedAt: new Date() })
    await handle.db.transaction(async (tx) => {
      await applySelection(tx, {
        packet: { id: packetId },
        candidates: stale.candidates,
        selected: new Set([flow.agendaDocumentId, photo]),
        now: new Date(),
      })
    })
    const items = await handle.db.select().from(boardPacketItems)
    expect(items.map((i) => i.documentId)).not.toContain(photo)
  })

  it('refuses a private link once its meeting is cancelled, however the link was made', async () => {
    const packetId = await sent([flow.agendaDocumentId])
    await sendPacketLink(
      handle.db,
      mail,
      flow.world.staff,
      { packetId, recipientName: 'Counsel', recipientEmail: 'counsel@alderpond.example' },
      signal,
    )
    const token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    await handle.db
      .update(boardMeetings)
      .set({ status: 'cancelled', cancelReason: 'Storm' })
      .where(eq(boardMeetings.id, flow.meetingId))
    expect(await openPacket(handle.db, token, new Date(), signal)).toEqual({
      ok: false,
      error: { cancelled: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
  })

  it('does not email an update to someone who has left the board', async () => {
    const packetId = await sent([flow.agendaDocumentId])
    const [left] = await handle.db
      .select({ id: boardMemberships.id })
      .from(boardMemberships)
      .innerJoin(users, eq(users.id, boardMemberships.userId))
      .where(
        and(
          eq(users.email, 'member1@alderpond.example'),
          eq(boardMemberships.boardId, boardIdSql('zba')),
        ),
      )
    await endMembership(handle.db, flow.world.staff, left?.id ?? '', signal)
    await save([flow.agendaDocumentId, await plan('Planner memo')])
    mail.sent.length = 0
    await sendPacketUpdate(handle.db, mail, flow.world.staff, { packetId }, signal)
    expect(mail.sent.map((m) => m.to)).not.toContain('member1@alderpond.example')
    expect(mail.sent.length).toBeGreaterThan(0)
  })

  it('sends only the changes it named, leaving a change saved meanwhile for the next update', async () => {
    const packetId = await sent([flow.agendaDocumentId])
    const memo = await plan('Planner memo')
    const late = await plan('Late letter')
    await save([flow.agendaDocumentId, memo])
    let saved = false
    const racing: MailTransport = {
      async send(message, s) {
        if (!saved) {
          saved = true
          await save([flow.agendaDocumentId, memo, late])
        }
        return await mail.send(message, s)
      },
    }
    await sendPacketUpdate(handle.db, racing, flow.world.staff, { packetId }, signal)
    const [packet] = await handle.db.select().from(boardPackets)
    if (packet === undefined) throw new Error('no packet')
    const pending = pendingChanges(await packetItemRows(handle.db, packetId), packet)
    expect(pending.added.map((r) => r.title)).toEqual(['Late letter'])
  })

  it('lets staff remove an item that is no longer a candidate', async () => {
    const packetId = await sent([flow.agendaDocumentId])
    await reopenAgenda(handle.db, flow.world.staff, flow.meetingId, signal)
    await publishAgenda(handle.db, store, flow.world.staff, flow.meetingId, signal)
    const view = await gatherPacket(handle.db, flow.world.staff, flow.meetingId, signal)
    if (!view.ok) throw new Error(view.error)
    const kept = view.value.groups.flatMap((g) => g.candidates)
    expect(kept.find((c) => c.documentId === flow.agendaDocumentId)?.checked).toBe(true)
    await save([])
    const [packet] = await handle.db.select().from(boardPackets)
    if (packet === undefined) throw new Error('no packet')
    const pending = pendingChanges(await packetItemRows(handle.db, packetId), packet)
    expect(pending.removed.map((r) => r.documentId)).toEqual([flow.agendaDocumentId])
  })

  it('keeps a sent removal in the readers list when a re-add is abandoned before sending', async () => {
    const letter = await plan('Letter')
    const packetId = await sent([flow.agendaDocumentId, letter])
    await save([flow.agendaDocumentId])
    await sendPacketUpdate(handle.db, mail, flow.world.staff, { packetId }, signal)
    await save([flow.agendaDocumentId, letter])
    expect((await readers(packetId)).find((i) => i.title === 'Letter')?.withdrawn?.why).toBe(
      'removed',
    )
    await save([flow.agendaDocumentId])
    expect((await readers(packetId)).find((i) => i.title === 'Letter')?.withdrawn?.why).toBe(
      'removed',
    )
  })

  it('lists older packets that belong to no meeting so their links can still be managed', async () => {
    await handle.db.insert(boardPackets).values({
      title: 'Old packet',
      boardId: await boardIdOf(handle.db, 'zba'),
      meetingDate: '2026-07-14',
      createdBy: flow.world.staff.userId,
    })
    const index = await loadPacketsIndex(
      handle.db,
      flow.world.staff,
      signal,
      new Date('2027-04-01'),
    )
    if (!index.ok) throw new Error(index.error)
    expect(index.value.unlinked.map((p) => p.title)).toEqual(['Old packet'])
    const id = index.value.unlinked[0]?.id ?? ''
    const legacy = await legacyPacketPage(handle.db, flow.world.staff, id, signal)
    expect(legacy).toMatchObject({ ok: true, value: { kind: 'legacy', title: 'Old packet' } })
    const linked = await sent([flow.agendaDocumentId])
    expect(await legacyPacketPage(handle.db, flow.world.staff, linked, signal)).toEqual({
      ok: true,
      value: { kind: 'redirect', href: `/staff/boards/meetings/${flow.meetingId}#packet` },
    })
    expect(await legacyPacketPage(handle.db, flow.world.reviewer, id, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

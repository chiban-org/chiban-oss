import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardPacketItems, boardPacketLinks, boardPacketMembers, boardPackets } from '@/db/schema'
import { addAgendaItem, publishAgenda, reopenAgenda } from '@/features/agendas/agendas'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { savePacket } from '@/features/boards/packetSave'
import { resendToLink, resendToMember, sendPacketToBoard } from '@/features/boards/packetSend'
import { trackPacket } from '@/features/boards/packetTrack'
import {
  agendaReplacement,
  replacePacketAgenda,
  sendPacketUpdate,
} from '@/features/boards/packetUpdate'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { applicationDocument, type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'

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

async function saved(documentIds: string[]): Promise<string> {
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

async function sentToBoard(documentIds: string[]): Promise<string> {
  const packetId = await saved(documentIds)
  const sent = await sendPacketToBoard(handle.db, mail, flow.world.staff, { packetId }, signal)
  if (!sent.ok) throw new Error(sent.error)
  return packetId
}

async function outsideLink(packetId: string, email = 'counsel@alderpond.example') {
  return await sendPacketLink(
    handle.db,
    mail,
    flow.world.staff,
    { packetId, recipientName: 'Town counsel', recipientEmail: email, expiresInDays: 7 },
    signal,
  )
}

async function plan(title: string): Promise<string> {
  return await applicationDocument(handle.db, store, flow, { title, audiences: ['board'] })
}

describe('sending a packet', () => {
  it('sends to every current member of the board and stamps the packet and its items as sent', async () => {
    await sentToBoard([flow.agendaDocumentId])
    expect(mail.sent.map((m) => m.to).sort()).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `member${n}@alderpond.example`),
    )
    expect(mail.sent[0]?.text).toContain('/board')
    expect(await handle.db.select().from(boardPacketMembers)).toHaveLength(6)
    const [packet] = await handle.db.select().from(boardPackets)
    expect(packet?.sentAt).not.toBeNull()
    const items = await handle.db.select().from(boardPacketItems)
    expect(items.every((i) => i.sentAt?.getTime() === packet?.sentAt?.getTime())).toBe(true)
  })

  it('does not send to the board twice', async () => {
    const packetId = await sentToBoard([flow.agendaDocumentId])
    expect(
      await sendPacketToBoard(handle.db, mail, flow.world.staff, { packetId }, signal),
    ).toEqual({ ok: false, error: 'already_sent' })
  })

  it('sends a private link with an expiry to someone outside the board and refuses a member', async () => {
    const packetId = await saved([flow.agendaDocumentId])
    expect((await outsideLink(packetId)).ok).toBe(true)
    const [link] = await handle.db.select().from(boardPacketLinks)
    expect(link?.recipientEmail).toBe('counsel@alderpond.example')
    expect(mail.sent[0]?.text).toContain('/board/packets/')
    expect(await outsideLink(packetId, 'member1@alderpond.example')).toEqual({
      ok: false,
      error: 'member_of_board',
    })
  })

  it('refuses a viewer who cannot manage packets', async () => {
    const packetId = await saved([flow.agendaDocumentId])
    expect(
      await sendPacketToBoard(handle.db, mail, flow.world.reviewer, { packetId }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('changing a packet after sending', () => {
  it('holds additions and removals until Send update, which emails only what changed', async () => {
    const letter = await plan('Letter from the fire chief')
    const packetId = await sentToBoard([flow.agendaDocumentId, letter])
    await outsideLink(packetId)
    const memo = await plan('Planner memo')
    await saved([flow.agendaDocumentId, memo])
    mail.sent.length = 0
    const updated = await sendPacketUpdate(handle.db, mail, flow.world.staff, { packetId }, signal)
    expect(updated).toEqual({ ok: true, value: { recipients: 7 } })
    const body = mail.sent[0]?.text ?? ''
    expect(body).toContain('Added: Planner memo')
    expect(body).toContain('Removed: Letter from the fire chief')
    expect(body).not.toContain('Agenda for')
    expect(await sendPacketUpdate(handle.db, mail, flow.world.staff, { packetId }, signal)).toEqual(
      { ok: false, error: 'no_changes' },
    )
  })

  it('offers to replace a republished agenda and names the replacement in the update', async () => {
    const packetId = await sentToBoard([flow.agendaDocumentId])
    expect(await agendaReplacement(handle.db, packetId, flow.meetingId)).toBeNull()
    await reopenAgenda(handle.db, flow.world.staff, flow.meetingId, signal)
    await addAgendaItem(
      handle.db,
      flow.world.staff,
      { meetingId: flow.meetingId, kind: 'other', title: 'Election of officers' },
      signal,
    )
    await publishAgenda(handle.db, store, flow.world.staff, flow.meetingId, signal)
    expect(await agendaReplacement(handle.db, packetId, flow.meetingId)).not.toBeNull()
    const replaced = await replacePacketAgenda(
      handle.db,
      flow.world.staff,
      { meetingId: flow.meetingId },
      signal,
    )
    expect(replaced.ok).toBe(true)
    expect(await agendaReplacement(handle.db, packetId, flow.meetingId)).toBeNull()
    mail.sent.length = 0
    await sendPacketUpdate(handle.db, mail, flow.world.staff, { packetId }, signal)
    expect(mail.sent[0]?.text).toContain('Replaced: Agenda for April 15, 2027, revision 2')
    expect(mail.sent[0]?.text).not.toContain('Removed:')
  })

  it('resends to one member, and resends a private link as a new link that retires the old one', async () => {
    const packetId = await sentToBoard([flow.agendaDocumentId])
    const sent = await outsideLink(packetId)
    if (!sent.ok) throw new Error(sent.error)
    const member = (await handle.db.select().from(boardPacketMembers))[0]
    mail.sent.length = 0
    const again = await resendToMember(
      handle.db,
      mail,
      flow.world.staff,
      { packetId, userId: member?.userId ?? '' },
      signal,
    )
    expect(again.ok).toBe(true)
    expect(mail.sent).toHaveLength(1)
    const relinked = await resendToLink(
      handle.db,
      mail,
      flow.world.staff,
      { linkId: sent.value.linkId },
      signal,
    )
    expect(relinked.ok).toBe(true)
    const links = await handle.db.select().from(boardPacketLinks)
    expect(links.map((l) => l.revokedAt === null).sort()).toEqual([false, true])
    expect(mail.sent.at(-1)?.text).toContain('/board/packets/')
  })

  it('tracks a member by the time the packet was last sent to them', async () => {
    const packetId = await sentToBoard([flow.agendaDocumentId])
    const member = (await handle.db.select().from(boardPacketMembers))[0]
    const resentAt = new Date((member?.sentAt.getTime() ?? 0) + 60 * 60 * 1000)
    const again = await resendToMember(
      handle.db,
      mail,
      flow.world.staff,
      { packetId, userId: member?.userId ?? '' },
      signal,
      resentAt,
    )
    expect(again.ok).toBe(true)
    const row = (await trackPacket(handle.db, packetId)).find(
      (r) => r.key === `member:${member?.userId}`,
    )
    expect(row?.sentAt).toEqual(resentAt)
  })
})

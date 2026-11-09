import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardPacketLinks } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { cancelMeeting } from '@/features/boards/meetings'
import {
  getMemberPacket,
  listMemberMeetings,
  openMemberPacketVersion,
} from '@/features/boards/memberPackets'
import { tellPacketRecipientsCancelled } from '@/features/boards/packetCancel'
import { openPacket, openPacketVersion, sendPacketLink } from '@/features/boards/packetLinks'
import { savePacket } from '@/features/boards/packetSave'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { trackPacket } from '@/features/boards/packetTrack'
import { sendPacketUpdate } from '@/features/boards/packetUpdate'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import {
  applicationDocument,
  type PacketFlow,
  packetFlow,
  seatedMember,
} from '@/test/packetFlowFixtures'

const signal = new AbortController().signal
const NOW = new Date()
let handle: TestDb
let store: ObjectStore
let flow: PacketFlow
let mail: MemoryMailTransport
let member: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  flow = await packetFlow(handle.db, store)
  mail = createMemoryTransport()
  member = await seatedMember(handle.db, flow, 'seated@alderpond.example')
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

async function sentWithLink(): Promise<{ packetId: string; token: string }> {
  const packetId = await saved([flow.agendaDocumentId])
  await sendPacketToBoard(handle.db, mail, flow.world.staff, { packetId }, signal)
  await sendPacketLink(
    handle.db,
    mail,
    flow.world.staff,
    { packetId, recipientName: 'Town counsel', recipientEmail: 'counsel@alderpond.example' },
    signal,
  )
  const token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
  return { packetId, token }
}

async function memberRow() {
  const page = await listMemberMeetings(handle.db, member, { limit: 10 }, signal)
  return page.rows.find((r) => r.meetingId === flow.meetingId)
}

describe('tracking who read the packet', () => {
  it('counts reads through a private link and through a member sign-in for the same packet', async () => {
    const { packetId, token } = await sentWithLink()
    const view = await getMemberPacket(handle.db, member, flow.meetingId, signal)
    if (!view.ok) throw new Error(view.error)
    const versionId = view.value.items[0]?.versionId ?? ''
    await openMemberPacketVersion(
      handle.db,
      member,
      { meetingId: flow.meetingId, versionId },
      signal,
    )
    await openPacket(handle.db, token, NOW, signal)
    await openPacketVersion(handle.db, token, versionId, NOW, signal)
    await openPacketVersion(handle.db, token, versionId, NOW, signal)
    const rows = await trackPacket(handle.db, packetId)
    const seated = rows.find((r) => r.email === 'seated@alderpond.example')
    const counsel = rows.find((r) => r.email === 'counsel@alderpond.example')
    expect(seated).toMatchObject({ gets: { kind: 'member' }, documentsOpened: 1 })
    expect(seated?.firstOpenedAt).not.toBeNull()
    expect(counsel).toMatchObject({ gets: { kind: 'link', revoked: false }, documentsOpened: 1 })
    expect(counsel?.lastOpenedAt).not.toBeNull()
    const unread = rows.find((r) => r.email === 'member1@alderpond.example')
    expect(unread).toMatchObject({ firstOpenedAt: null, documentsOpened: 0 })
  })
})

describe('what members see', () => {
  it('sees nothing of a packet that has not been sent', async () => {
    await saved([flow.agendaDocumentId])
    expect((await memberRow())?.hasPacket).toBe(false)
    expect(await getMemberPacket(handle.db, member, flow.meetingId, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('marks a packet New until it is opened and Updated after an update is sent', async () => {
    await sentWithLink()
    expect((await memberRow())?.marker).toEqual({ kind: 'new' })
    await getMemberPacket(handle.db, member, flow.meetingId, signal)
    expect((await memberRow())?.marker).toBeNull()
    const memo = await applicationDocument(handle.db, store, flow, {
      title: 'Planner memo',
      audiences: ['board'],
    })
    await saved([flow.agendaDocumentId, memo])
    const view = await getMemberPacket(handle.db, member, flow.meetingId, signal)
    expect(view.ok && view.value.items.map((i) => i.title)).not.toContain('Planner memo')
    const packet = await handle.db.query.boardPackets.findFirst()
    await sendPacketUpdate(
      handle.db,
      mail,
      flow.world.staff,
      { packetId: packet?.id ?? '' },
      signal,
      new Date(Date.now() + 60_000),
    )
    expect((await memberRow())?.marker).toMatchObject({ kind: 'updated' })
    const after = await getMemberPacket(handle.db, member, flow.meetingId, signal)
    if (!after.ok) throw new Error(after.error)
    expect(after.value.items.map((i) => [i.title, i.mark])).toContainEqual([
      'Planner memo',
      'added',
    ])
  })
})

describe('cancelling a meeting with a sent packet', () => {
  it('turns off the private links, tells the recipients when asked, and shows the meeting as cancelled', async () => {
    const { token } = await sentWithLink()
    const cancelled = await cancelMeeting(
      handle.db,
      flow.world.staff,
      { meetingId: flow.meetingId, reason: 'No quorum' },
      signal,
    )
    expect(cancelled.ok).toBe(true)
    const links = await handle.db.select().from(boardPacketLinks)
    expect(links.every((l) => l.revokedAt !== null)).toBe(true)
    expect(await openPacket(handle.db, token, NOW, signal)).toEqual({
      ok: false,
      error: { cancelled: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
    mail.sent.length = 0
    const told = await tellPacketRecipientsCancelled(
      handle.db,
      mail,
      flow.world.staff,
      { meetingId: flow.meetingId },
      signal,
    )
    expect(told).toEqual({ ok: true, value: { told: 8 } })
    expect(mail.sent.map((m) => m.to)).toContain('counsel@alderpond.example')
    expect(mail.sent[0]?.text).toContain('No quorum')
    expect(await memberRow()).toMatchObject({ cancelled: true, hasPacket: false })
  })
})

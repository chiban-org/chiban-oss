import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { cancelMeeting } from '@/features/boards/meetings'
import { inviteBoardMember } from '@/features/boards/members'
import { tellPacketRecipientsCancelled } from '@/features/boards/packetCancel'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { savePacket } from '@/features/boards/packetSave'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { sendPacketUpdate } from '@/features/boards/packetUpdate'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { boardIdOf } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { applicationDocument, type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'
import type { CivilDate } from '@/types/civilDate'

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

async function publishWording(events: Record<string, { subject: string; body: string }>) {
  await saveAndPublish(handle.db, flow.world.admin, 'notification_wording', 'default', {
    key: 'default',
    events,
  })
}

async function savedPacket(documentIds: string[]): Promise<string> {
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

describe('board emails use the published wording', () => {
  it('sends the overridden membership invitation with the board link', async () => {
    await publishWording({
      board_member_added: {
        subject: 'Welcome to {{board.name}}',
        body: 'You now serve as {{member.title}}. {{link}}',
      },
    })
    const invited = await inviteBoardMember(
      handle.db,
      mail,
      flow.world.staff,
      {
        email: 'new.member@alderpond.example',
        displayName: 'New Member',
        boardId: await boardIdOf(handle.db, 'zba'),
        title: 'alternate',
        termStart: '2026-11-01' as CivilDate,
      },
      signal,
    )
    expect(invited.ok).toBe(true)
    const sent = mail.sent[0]
    expect(sent?.to).toBe('new.member@alderpond.example')
    expect(sent?.subject).toMatch(/^Welcome to .+/)
    expect(sent?.text).toContain('You now serve as alternate.')
    expect(sent?.text).toContain(`${env.BASE_URL}/board`)
    expect(sent?.html).toContain(`<a href="${env.BASE_URL}/board">`)
  })

  it('sends the overridden packet email to every member with the board link', async () => {
    await publishWording({
      board_packet_ready: {
        subject: 'Ready: {{packet.title}}',
        body: 'Packet for {{meeting.date}} is up. {{link}}',
      },
    })
    const packetId = await savedPacket([flow.agendaDocumentId])
    const sent = await sendPacketToBoard(handle.db, mail, flow.world.staff, { packetId }, signal)
    expect(sent.ok).toBe(true)
    expect(mail.sent).toHaveLength(6)
    for (const message of mail.sent) {
      expect(message.subject).toMatch(/^Ready: /)
      expect(message.text).toContain('is up.')
      expect(message.text).toContain(`${env.BASE_URL}/board`)
      expect(message.html).toContain('<a href=')
    }
  })

  it('sends the overridden private link email with the packet link', async () => {
    await publishWording({
      board_packet_link: {
        subject: 'For {{recipient.name}}: {{packet.title}}',
        body: 'Hello {{recipient.name}}, open it within {{link.days}} days: {{link}}',
      },
    })
    const packetId = await savedPacket([flow.agendaDocumentId])
    const result = await sendPacketLink(
      handle.db,
      mail,
      flow.world.staff,
      {
        packetId,
        recipientName: 'Town counsel',
        recipientEmail: 'counsel@alderpond.example',
        expiresInDays: 7,
      },
      signal,
    )
    expect(result.ok).toBe(true)
    const sent = mail.sent[0]
    expect(sent?.subject).toMatch(/^For Town counsel: /)
    expect(sent?.text).toContain('Hello Town counsel, open it within 7 days: ')
    expect(sent?.text).toContain(`${env.BASE_URL}/board/packets/`)
  })

  it('sends the overridden update email, with the board link only to signed-in members', async () => {
    await publishWording({
      board_packet_updated: {
        subject: 'Changed: {{packet.title}}',
        body: 'Now: {{packet.changes}}',
      },
    })
    const letter = await applicationDocument(handle.db, store, flow, {
      title: 'Letter from the fire chief',
      audiences: ['board'],
    })
    const packetId = await savedPacket([flow.agendaDocumentId])
    await sendPacketToBoard(handle.db, mail, flow.world.staff, { packetId }, signal)
    await savedPacket([flow.agendaDocumentId, letter])
    mail.sent.length = 0
    const updated = await sendPacketUpdate(handle.db, mail, flow.world.staff, { packetId }, signal)
    expect(updated.ok).toBe(true)
    const sent = mail.sent[0]
    expect(sent?.subject).toMatch(/^Changed: /)
    expect(sent?.text).toContain('Now: Added: Letter from the fire chief')
    expect(sent?.text).toContain(`${env.BASE_URL}/board`)
  })

  it('sends the overridden cancellation email with no link', async () => {
    await publishWording({
      board_meeting_cancelled: {
        subject: 'Off: {{packet.title}}',
        body: 'Cancelled because {{meeting.reason}}.',
      },
    })
    const packetId = await savedPacket([flow.agendaDocumentId])
    await sendPacketToBoard(handle.db, mail, flow.world.staff, { packetId }, signal)
    const cancelled = await cancelMeeting(
      handle.db,
      flow.world.staff,
      { meetingId: flow.meetingId, reason: 'No quorum' },
      signal,
    )
    expect(cancelled.ok).toBe(true)
    mail.sent.length = 0
    const told = await tellPacketRecipientsCancelled(
      handle.db,
      mail,
      flow.world.staff,
      { meetingId: flow.meetingId },
      signal,
    )
    expect(told.ok).toBe(true)
    const sent = mail.sent[0]
    expect(sent?.subject).toMatch(/^Off: /)
    expect(sent?.text).toBe('Cancelled because No quorum.\n')
    expect(sent?.html).not.toContain('<a ')
  })
})

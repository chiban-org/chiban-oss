import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { boardPacketLinks, boardPacketMembers, boardPackets } from '@/db/schema'
import { addAgendaItem, publishAgenda, reopenAgenda } from '@/features/agendas/agendas'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { savePacket } from '@/features/boards/packetSave'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'
import {
  actionHarness,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./packetActions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal

let flow: PacketFlow
let packetId = ''
let memberUserId = ''
let linkId = ''

beforeAll(async () => {
  flow = await packetFlow(h.db, h.store)
  const mail = createMemoryTransport()
  const saved = await savePacket(
    h.db,
    h.store,
    flow.world.staff,
    { meetingId: flow.meetingId, documentIds: [flow.agendaDocumentId], trcApplicationIds: [] },
    signal,
  )
  if (!saved.ok) throw new Error(JSON.stringify(saved.error))
  packetId = saved.value.packetId
  await sendPacketToBoard(h.db, mail, flow.world.staff, { packetId }, signal)
  await sendPacketLink(
    h.db,
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
  const [member] = await h.db
    .select({ userId: boardPacketMembers.userId })
    .from(boardPacketMembers)
    .where(eq(boardPacketMembers.packetId, packetId))
  memberUserId = member?.userId ?? ''
  const [link] = await h.db
    .select({ id: boardPacketLinks.id })
    .from(boardPacketLinks)
    .where(eq(boardPacketLinks.packetId, packetId))
  linkId = link?.id ?? ''
})

function resendRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'packetId':
      return refuseField('packetId', idMessage('a packet'))
    case 'userId':
      return refuseField('userId', idMessage('a member'))
    default:
      return refuseField('linkId', idMessage('a link'))
  }
}

describeActionCases(h, 'resendAction', {
  invoke: actions.resendAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ packetId, userId: memberUserId }),
  fields: { packetId: uuid(), userId: uuid(), linkId: uuid() },
  capability: 'packet.manage',
  refusals: { ...STAFF_REFUSALS, invalid: resendRefusal, checkOnly: CHECK_PASSED },
  accepted: (result) => {
    expect(result).toEqual({ ok: true, message: 'Sent again.' })
    expect(h.mail.sent.map((m) => m.to)).toEqual(['member1@alderpond.example'])
  },
})

describe('resendAction to an outside link', () => {
  it('sends the private link again to its recipient', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await actions.resendAction(h.form({ linkId }))
    expect(result).toEqual({ ok: true, message: 'Sent again.' })
    expect(h.mail.sent.map((m) => m.to)).toEqual(['counsel@alderpond.example'])
  })

  it('refuses a member resend with no member chosen beside the member field', async () => {
    h.signIn(await h.actorFor('admin'))
    const { value, written } = await h.recordWrites(() =>
      actions.resendAction(h.form({ packetId })),
    )
    expect({ value, written, mailed: h.mail.sent.length }).toEqual({
      value: refuseField('userId', 'Choose a member.'),
      written: [],
      mailed: 0,
    })
  })
})

const newAgenda = lazy(async () => {
  await reopenAgenda(h.db, flow.world.staff, flow.meetingId, signal)
  await addAgendaItem(
    h.db,
    flow.world.staff,
    { meetingId: flow.meetingId, kind: 'other', title: 'Election of officers' },
    signal,
  )
  const published = await publishAgenda(h.db, h.store, flow.world.staff, flow.meetingId, signal)
  if (!published.ok) throw new Error(published.error)
})

describeActionCases(h, 'replaceAgendaAction', {
  invoke: actions.replaceAgendaAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    await newAgenda()
    return { meetingId: flow.meetingId }
  },
  fields: { meetingId: uuid({ required: true }) },
  capability: 'packet.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('meetingId', idMessage('a meeting')),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Agenda replaced. Send the update to tell recipients.',
    })
    expect(written).toContain('board_packet_items')
  },
})

describeActionCases(h, 'sendUpdateAction', {
  invoke: actions.sendUpdateAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ packetId }),
  fields: { packetId: uuid({ required: true }) },
  capability: 'packet.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('packetId', idMessage('a packet')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Update sent to 7 recipients.' })
    expect(h.mail.sent).toHaveLength(7)
    const [packet] = await db
      .select({ sentAt: boardPackets.sentAt })
      .from(boardPackets)
      .where(eq(boardPackets.id, packetId))
    expect(packet?.sentAt).not.toBeNull()
  },
})

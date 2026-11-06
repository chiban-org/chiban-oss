import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { boardPacketLinks, boardPackets } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'
import {
  actionHarness,
  describeActionCases,
  type FieldSpec,
  type InvalidVariant,
  int,
  STAFF_REFUSALS,
  text,
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

let flow: PacketFlow
beforeAll(async () => {
  flow = await packetFlow(h.db, h.store)
})

async function packetId(): Promise<string> {
  const [row] = await h.db
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, flow.meetingId))
  return row?.id ?? ''
}

const EMAIL: FieldSpec = {
  required: true,
  variants: [{ kind: 'words', label: 'without an at sign', value: 'notemail' }],
}

let outsiders = 0
function nextOutsider(): string {
  outsiders += 1
  return `counsel${outsiders}@alderpond.example`
}

describeActionCases(h, 'gatherPacketAction', {
  invoke: actions.gatherPacketAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    meetingId: flow.meetingId,
    documentId: [flow.agendaDocumentId],
    trcApplicationId: [],
  }),
  fields: { meetingId: uuid({ required: true }) },
  capability: 'packet.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('meetingId', idMessage('a meeting')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Packet saved.' })
    expect(written).toContain('board_packets')
    const rows = await db
      .select({ title: boardPackets.title, meetingId: boardPackets.meetingId })
      .from(boardPackets)
    expect(rows).toEqual([{ title: expect.any(String), meetingId: flow.meetingId }])
  },
})

function renameRefusal(variant: InvalidVariant) {
  return variant.field === 'packetId'
    ? refuseField('packetId', idMessage('a packet'))
    : refuseField('title', textMessage('a title', 200, variant))
}

describeActionCases(h, 'renamePacketAction', {
  invoke: actions.renamePacketAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ packetId: await packetId(), title: 'April 15 packet, revised' }),
  fields: { packetId: uuid({ required: true }), title: text({ required: true, max: 200 }) },
  capability: 'packet.manage',
  refusals: { ...STAFF_REFUSALS, invalid: renameRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Title saved.' })
    expect(written).toEqual(['board_packets'])
    const [row] = await db.select({ title: boardPackets.title }).from(boardPackets)
    expect(row).toEqual({ title: 'April 15 packet, revised' })
  },
})

describe('renamePacketAction with the title length from the forms sweep', () => {
  it('refuses a 700 character title beside the Title field and keeps the saved title', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ packetId: await packetId(), title: 'x'.repeat(700) })
    const { value, written } = await h.recordWrites(() => actions.renamePacketAction(form))
    const [row] = await h.db.select({ title: boardPackets.title }).from(boardPackets)
    expect({ value, written, title: row?.title }).toEqual({
      value: refuseField('title', 'Enter a title of 200 characters or fewer.'),
      written: [],
      title: 'April 15 packet, revised',
    })
  })
})

function outsideRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'packetId':
      return refuseField('packetId', idMessage('a packet'))
    case 'recipientName':
      return refuseField('recipientName', textMessage('a name', 200, variant))
    case 'recipientEmail':
      return refuseField(
        'recipientEmail',
        variant.kind === 'missing'
          ? 'Enter an email address.'
          : 'Enter an email address like name@example.com.',
      )
    default:
      return refuseField('days', 'Enter the number of days as a whole number from 1 to 30.')
  }
}

describeActionCases(h, 'sendOutsideAction', {
  invoke: actions.sendOutsideAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    packetId: await packetId(),
    recipientName: 'Town counsel',
    recipientEmail: nextOutsider(),
    days: '3',
  }),
  fields: {
    packetId: uuid({ required: true }),
    recipientName: text({ required: true, max: 200 }),
    recipientEmail: EMAIL,
    days: int({ min: 1, max: 30 }),
  },
  capability: 'packet.manage',
  refusals: { ...STAFF_REFUSALS, invalid: outsideRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Private link sent.' })
    expect(written).toEqual([
      'audit_log',
      'board_packet_items',
      'board_packet_links',
      'board_packets',
    ])
    expect(h.mail.sent.map((m) => m.to)).toEqual([input.recipientEmail])
    const links = await db
      .select({
        name: boardPacketLinks.recipientName,
        email: boardPacketLinks.recipientEmail,
      })
      .from(boardPacketLinks)
    expect(links).toEqual([{ name: 'Town counsel', email: input.recipientEmail }])
  },
})

describe('sendOutsideAction with the whitespace name from the forms sweep', () => {
  it('refuses a name of three spaces beside the Name field, sends nothing and saves no link', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      packetId: await packetId(),
      recipientName: '   ',
      recipientEmail: nextOutsider(),
      days: '3',
    })
    const before = (await h.db.select().from(boardPacketLinks)).length
    const { value, written } = await h.recordWrites(() => actions.sendOutsideAction(form))
    expect({
      value,
      written,
      mailed: h.mail.sent.length,
      links: (await h.db.select().from(boardPacketLinks)).length - before,
    }).toEqual({
      value: refuseField('recipientName', 'Enter a name.'),
      written: [],
      mailed: 0,
      links: 0,
    })
  })

  it('refuses a seated member beside the Email field', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({
      packetId: await packetId(),
      recipientName: 'Avery Stone',
      recipientEmail: 'member1@alderpond.example',
    })
    expect(await actions.sendOutsideAction(form)).toEqual(
      refuseField(
        'recipientEmail',
        'This person is a seated member of the board. Send the packet to the board instead.',
      ),
    )
  })
})

describeActionCases(h, 'turnOffLinkAction', {
  invoke: actions.turnOffLinkAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    const [link] = await h.db
      .select({ id: boardPacketLinks.id })
      .from(boardPacketLinks)
      .where(eq(boardPacketLinks.recipientName, 'Town counsel'))
    return { linkId: link?.id ?? '' }
  },
  fields: { linkId: uuid({ required: true }) },
  capability: 'packet.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('linkId', idMessage('a link')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Link turned off.' })
    const [link] = await db
      .select({ revokedAt: boardPacketLinks.revokedAt })
      .from(boardPacketLinks)
      .where(eq(boardPacketLinks.id, String(input.linkId)))
    expect(link?.revokedAt).not.toBeNull()
  },
})

describeActionCases(h, 'sendToBoardAction', {
  invoke: actions.sendToBoardAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ packetId: await packetId() }),
  fields: { packetId: uuid({ required: true }) },
  capability: 'packet.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('packetId', idMessage('a packet')),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Sent to 6 members.' })
    expect(written).toEqual(['audit_log', 'board_packet_members'])
    expect(h.mail.sent).toHaveLength(6)
  },
})

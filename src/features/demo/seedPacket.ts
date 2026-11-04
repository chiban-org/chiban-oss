import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings, boardPackets, documents } from '@/db/schema'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { actorFor, must, noon } from '@/features/demo/seedPermitSupport'
import { RECORDS_MARKER_TITLE } from '@/features/demo/seedRecords'
import { getMailTransport, type MailTransport } from '@/features/mail/transport'

const PACKET_MEETING = '2026-07-22'
const PACKET_FILES = [RECORDS_MARKER_TITLE, 'Septic approval']

async function packetMeetingId(db: Db): Promise<string | null> {
  const [meeting] = await db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.board, 'planning_board'),
        eq(boardMeetings.meetingDate, PACKET_MEETING),
        eq(boardMeetings.status, 'scheduled'),
      ),
    )
  return meeting?.id ?? null
}

export async function seedBoardPacket(
  db: Db,
  signal: AbortSignal,
  mail?: MailTransport,
): Promise<boolean> {
  signal.throwIfAborted()
  const linked = await db
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .where(isNotNull(boardPackets.meetingId))
    .limit(1)
  if (linked.length > 0) return false
  const meetingId = await packetMeetingId(db)
  const files = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.recordKind, 'parcel'), inArray(documents.title, PACKET_FILES)))
    .orderBy(asc(documents.seq))
    .limit(PACKET_FILES.length)
  if (meetingId === null || files.length === 0) return false
  const staff = await actorFor(db, 'staff', signal)
  const packet = must(
    await createPacket(
      db,
      staff,
      { title: 'Planning Board agenda', meetingId, documentIds: files.map((f) => f.id) },
      signal,
    ),
    'packet',
  )
  await sendPacketLink(
    db,
    mail ?? getMailTransport(),
    staff,
    {
      packetId: packet.packetId,
      recipientName: 'Bea Board',
      recipientEmail: `board@${DEMO_DOMAIN}`,
    },
    signal,
    noon('2026-07-01'),
  )
  return true
}

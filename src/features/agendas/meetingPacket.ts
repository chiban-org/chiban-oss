import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendas, boardPackets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { gatherPacket } from '@/features/boards/packetGather'
import { savePacket } from '@/features/boards/packetSave'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export type MeetingPacketError =
  | 'forbidden'
  | 'not_found'
  | 'empty'
  | 'agenda_not_published'
  | 'packet_exists'
  | 'meeting_cancelled'
  | { notForBoard: string[] }

export async function meetingPacketId(db: Db, meetingId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, meetingId))
  return row?.id ?? null
}

export async function createMeetingPacket(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<{ packetId: string; documents: number }, MeetingPacketError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  const [agenda] = await db.select().from(agendas).where(eq(agendas.meetingId, meetingId))
  if (agenda === undefined) return err('empty')
  const gathered = await gatherPacket(db, actor, meetingId, signal)
  if (!gathered.ok) return gathered
  if (gathered.value.packetId !== null) return err('packet_exists')
  const groups = gathered.value.groups
  const documentIds = groups.flatMap((g) =>
    g.candidates.filter((c) => c.exclusion === null).map((c) => c.documentId),
  )
  const trcApplicationIds = groups.flatMap((g) =>
    g.trc === 'make' && g.applicationId !== null ? [g.applicationId] : [],
  )
  const saved = await savePacket(
    db,
    store,
    actor,
    { meetingId, documentIds, trcApplicationIds },
    signal,
  )
  return saved.ok ? ok({ packetId: saved.value.packetId, documents: saved.value.added }) : saved
}

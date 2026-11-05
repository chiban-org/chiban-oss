import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardPackets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { packetItemRows } from '@/features/boards/packetContents'
import type { PacketView } from '@/features/boards/packetView'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export async function packetCoverPreview(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<PacketView, 'forbidden' | 'not_found'>> {
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  if (!isUuid(meetingId)) return err('not_found')
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.meetingId, meetingId))
  if (packet === undefined) return err('not_found')
  const rows = await packetItemRows(db, packet.id)
  return ok({
    packetId: packet.id,
    title: packet.title,
    board: packet.board,
    meetingDate: packet.meetingDate as CivilDate,
    expiresAt: '',
    items: rows
      .filter((r) => r.removedAt === null)
      .map((r) => ({
        versionId: r.versionId ?? '',
        title: r.title,
        filename: r.filename ?? '',
        mark: null,
        withdrawnOn: null,
        withdrawnWhy: null,
      })),
  })
}

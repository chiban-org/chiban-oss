import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { auditLog, boardPacketItems, boardPacketLinks, documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { eligibleBoardDocuments, listPackets } from '@/features/boards/packets'
import { BOARD_NAMES } from '@/features/hearings/views'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate, formatInstant } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'

export interface PacketLinkLine {
  id: string
  text: string
  revocable: boolean
}

export interface PacketsPageView {
  packets: {
    id: string
    heading: string
    meeting: string
    documents: string[]
    links: PacketLinkLine[]
    notified: string[]
  }[]
  documents: { id: string; label: string }[]
}

const FALLBACK_ZONE = 'America/New_York'

export async function loadPacketsPage(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<PacketsPageView, 'forbidden'>> {
  signal.throwIfAborted()
  const packets = await listPackets(db, actor, signal)
  if (!packets.ok) return err('forbidden')
  const eligible = await eligibleBoardDocuments(db, actor, signal)
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : FALLBACK_ZONE
  const ids = packets.value.map((p) => p.id)
  const links =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(boardPacketLinks)
          .where(inArray(boardPacketLinks.packetId, ids))
          .orderBy(desc(boardPacketLinks.createdAt))
  const items =
    ids.length === 0
      ? []
      : await db
          .select({
            packetId: boardPacketItems.packetId,
            title: documents.title,
            withdrawnAt: boardPacketItems.withdrawnAt,
          })
          .from(boardPacketItems)
          .innerJoin(documents, eq(documents.id, boardPacketItems.documentId))
          .where(inArray(boardPacketItems.packetId, ids))
          .orderBy(asc(boardPacketItems.position))
  const notices =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(auditLog)
          .where(and(eq(auditLog.action, 'packet.member.notify'), inArray(auditLog.entityId, ids)))
          .orderBy(desc(auditLog.at))
  return ok({
    packets: packets.value.map((p) => ({
      id: p.id,
      heading: p.title,
      meeting: `${BOARD_NAMES[p.board]} meeting, ${formatCivilDate(p.meetingDate)}`,
      documents: items
        .filter((i) => i.packetId === p.id)
        .map((i) => (i.withdrawnAt === null ? i.title : `${i.title} (withdrawn)`)),
      links: links
        .filter((l) => l.packetId === p.id)
        .map((l) => ({
          id: l.id,
          revocable: l.revokedAt === null,
          text: `${l.recipientName} (${l.recipientEmail}), ${l.revokedAt === null ? `expires ${formatInstant(l.expiresAt, zone)}` : 'revoked'}`,
        })),
      notified: notices
        .filter((n) => n.entityId === p.id)
        .map((n) => {
          const after = (n.after ?? {}) as { recipientName?: string; recipientEmail?: string }
          const who =
            after.recipientName === undefined || after.recipientName === ''
              ? (after.recipientEmail ?? '')
              : `${after.recipientName} (${after.recipientEmail ?? ''})`
          return `${who}, notified ${formatInstant(n.at, zone)}. Reads the packet on their board page.`
        }),
    })),
    documents: eligible.ok ? eligible.value.map((d) => ({ id: d.id, label: d.label })) : [],
  })
}

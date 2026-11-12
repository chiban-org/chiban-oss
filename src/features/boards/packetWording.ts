import type { DbOrTx } from '@/db/client'
import type { PacketWording } from '@/features/boards/packetMail'
import { boardLabel, getBoard } from '@/features/boards/townBoards'
import { publishedWording } from '@/features/notifications/messageSettings'

export async function loadPacketWording(
  db: DbOrTx,
  boardId: string,
  signal: AbortSignal,
): Promise<PacketWording> {
  const [overrides, board] = await Promise.all([
    publishedWording(db, signal),
    getBoard(db, boardId),
  ])
  return board === null ? { overrides } : { overrides, boardName: boardLabel(board) }
}

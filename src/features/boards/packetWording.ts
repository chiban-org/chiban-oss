import type { DbOrTx } from '@/db/client'
import type { PacketWording } from '@/features/boards/packetMail'
import { boardLabel, getBoard } from '@/features/boards/townBoards'
import { publishedWording, townName } from '@/features/notifications/messageSettings'

export async function loadPacketWording(
  db: DbOrTx,
  boardId: string,
  signal: AbortSignal,
): Promise<PacketWording> {
  const [overrides, board, town] = await Promise.all([
    publishedWording(db, signal),
    getBoard(db, boardId),
    townName(db, signal),
  ])
  return board === null
    ? { overrides, townName: town }
    : { overrides, townName: town, boardName: boardLabel(board) }
}

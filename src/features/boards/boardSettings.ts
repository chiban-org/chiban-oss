import type { DbOrTx } from '@/db/client'
import {
  BOARD_SETTINGS_DEFAULT,
  type BoardSettingsBody,
} from '@/features/boards/boardSettingsSchema'
import { getPublished } from '@/features/config/store'

export * from '@/features/boards/boardSettingsSchema'

export async function getBoardSettings(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<BoardSettingsBody> {
  const published = await getPublished(db, 'board_settings', 'default', signal)
  return published === null ? BOARD_SETTINGS_DEFAULT : (published.body as BoardSettingsBody)
}

export function boardLabel(settings: BoardSettingsBody, board: 'planning_board' | 'zba'): string {
  return settings.boards.find((b) => b.board === board)?.label ?? board
}

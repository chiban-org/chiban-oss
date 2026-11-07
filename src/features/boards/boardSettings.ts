import type { DbOrTx } from '@/db/client'
import { type BoardSettingsBody, boardSettingsDefault } from '@/features/boards/boardSettingsSchema'
import { activeBoards } from '@/features/boards/townBoards'
import { getPublished } from '@/features/config/store'

export * from '@/features/boards/boardSettingsSchema'

export async function getBoardSettings(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<BoardSettingsBody> {
  const published = await getPublished(db, 'board_settings', 'default', signal)
  return published === null
    ? boardSettingsDefault(await activeBoards(db))
    : (published.body as BoardSettingsBody)
}

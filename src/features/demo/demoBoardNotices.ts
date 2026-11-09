import type { BoardKind } from '@packs/nh/schema'
import {
  type BoardSettingsBody,
  type BoardSettingsEntry,
  boardSettingsDefault,
} from '@/features/boards/boardSettingsSchema'

const TOWN_HALL = 'Alder Pond Town Hall bulletin board'

const DEMO_NOTICE_PLACES: Partial<
  Record<BoardKind, Pick<BoardSettingsEntry['publicNotice'], 'newspaper' | 'bulletinBoards'>>
> = {
  zba: { newspaper: 'Alder Pond Ledger', bulletinBoards: [TOWN_HALL] },
  planning_board: { newspaper: null, bulletinBoards: [TOWN_HALL, 'Alder Pond Public Library'] },
}

export function demoBoardSettings(
  boards: readonly { id: string; kind: BoardKind }[],
): BoardSettingsBody {
  const kinds = new Map(boards.map((b) => [b.id, b.kind]))
  const places = new Map(Object.entries(DEMO_NOTICE_PLACES))
  const body = boardSettingsDefault(boards)
  return {
    ...body,
    boards: body.boards.map((entry) => {
      const demo = places.get(kinds.get(entry.boardId) ?? '')
      return demo === undefined
        ? entry
        : { ...entry, publicNotice: { ...entry.publicNotice, ...demo } }
    }),
  }
}

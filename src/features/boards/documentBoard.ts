import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardMeetings, boards } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { boardOfApplication } from '@/features/boards/boardOf'
import { boardForKind } from '@/features/boards/townBoards'

export interface DocumentOwner {
  boardId: string
  boardShortName: string
  applicationNumber: string | null
}

export function documentOwners(db: DbOrTx, signal: AbortSignal) {
  const cache = new Map<string, DocumentOwner | null>()
  return async (doc: { recordKind: string; recordId: string }): Promise<DocumentOwner | null> => {
    const key = `${doc.recordKind}:${doc.recordId}`
    if (cache.has(key)) return cache.get(key) ?? null
    let owner: DocumentOwner | null = null
    if (doc.recordKind === 'application') {
      const app = await loadApplicationContext(db, doc.recordId, signal)
      const kind = app === null ? null : boardOfApplication(app)
      const board = kind === null ? null : await boardForKind(db, kind, signal)
      owner =
        board === null || app === null
          ? null
          : { boardId: board.id, boardShortName: board.shortName, applicationNumber: app.number }
    } else if (doc.recordKind === 'meeting') {
      const [meeting] = await db
        .select({ boardId: boardMeetings.boardId, shortName: boards.shortName })
        .from(boardMeetings)
        .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
        .where(eq(boardMeetings.id, doc.recordId))
      owner =
        meeting === undefined
          ? null
          : {
              boardId: meeting.boardId,
              boardShortName: meeting.shortName,
              applicationNumber: null,
            }
    }
    cache.set(key, owner)
    return owner
  }
}

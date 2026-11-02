import type { Board } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardMeetings } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { boardOfApplication } from '@/features/boards/boardOf'

export interface DocumentOwner {
  board: Board
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
      const board = app === null ? null : boardOfApplication(app)
      owner = board === null || app === null ? null : { board, applicationNumber: app.number }
    } else if (doc.recordKind === 'meeting') {
      const [meeting] = await db
        .select({ board: boardMeetings.board })
        .from(boardMeetings)
        .where(eq(boardMeetings.id, doc.recordId))
      owner = meeting === undefined ? null : { board: meeting.board, applicationNumber: null }
    }
    cache.set(key, owner)
    return owner
  }
}

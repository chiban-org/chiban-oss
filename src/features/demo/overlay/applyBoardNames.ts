import { renameBoard } from '@/features/boards/boardAdmin'
import { activeBoards } from '@/features/boards/townBoards'
import { DemoOverlayError, failWith } from '@/features/demo/overlay/overlayIssue'
import { type OverlayRun, publishIssue } from '@/features/demo/overlay/publishOverlay'

export async function applyBoardNames(run: OverlayRun): Promise<void> {
  const active = await activeBoards(run.db)
  for (const [kind, board] of Object.entries(run.overlay.boards ?? {})) {
    if (board.name === undefined && board.shortName === undefined) continue
    const path = `boards.${kind}.name`
    const matching = active.filter((b) => b.kind === kind)
    if (matching.length !== 1) {
      failWith([{ path, message: `there has to be exactly one active ${kind} board to rename` }])
    }
    for (const row of matching) {
      const input = {
        boardId: row.id,
        name: board.name ?? row.name,
        shortName: board.shortName ?? row.shortName,
      }
      const renamed = await renameBoard(run.db, run.actor, input, run.signal)
      if (!renamed.ok) throw new DemoOverlayError(publishIssue(path, renamed.error))
    }
  }
}

'use server'

import {
  archiveBlockers,
  archiveBoard,
  createBoard,
  renameBoard,
} from '@/features/boards/boardAdmin'
import { getBoard } from '@/features/boards/townBoards'
import { isCheckOnly } from '@/server/actionGuard'
import { type ActionResult, runStaffAction } from '@/server/actionRunner'
import { CHECK_PASSED, parseForm, refuseField, runStaffForm } from '@/server/formInput'
import { ADD_BOARD_FORM, ARCHIVE_BOARD_FORM, RENAME_BOARD_FORM } from './forms'

const NAME_TAKEN = 'Another active board already has this name.'
const KIND_TAKEN = 'The town already has an active board of this kind.'
const FORBIDDEN = 'You do not have permission to change boards.'
const GONE = 'That board was not found.'

export async function addBoardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ADD_BOARD_FORM, async ({ db, actor, signal }, input) => {
    const made = await createBoard(db, actor, input, signal)
    if (made.ok) return { ok: true, message: `${input.name} added.` }
    if (made.error === 'name_taken') return refuseField('name', NAME_TAKEN)
    if (made.error === 'kind_taken') return refuseField('kind', KIND_TAKEN)
    return { ok: false, error: FORBIDDEN }
  })
}

export async function renameBoardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RENAME_BOARD_FORM, async ({ db, actor, signal }, input) => {
    const saved = await renameBoard(db, actor, input, signal)
    if (saved.ok) return { ok: true, message: 'Board saved.' }
    if (saved.error === 'name_taken') return refuseField('name', NAME_TAKEN)
    if (saved.error === 'archived') {
      return { ok: false, error: 'An archived board cannot be renamed.' }
    }
    return { ok: false, error: saved.error === 'forbidden' ? FORBIDDEN : GONE }
  })
}

export async function archiveBoardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(
    formData,
    async ({ db, actor, signal }) => {
      const parsed = parseForm(ARCHIVE_BOARD_FORM, formData)
      if (!parsed.ok) return parsed.error
      const board = await getBoard(db, parsed.value.boardId)
      if (board === null) return { ok: false, error: GONE }
      if (board.archivedAt !== null)
        return { ok: false, error: `${board.name} is already archived.` }
      const blocked = await archiveBlockers(db, board, signal)
      if (blocked.length > 0) {
        return { ok: false, error: `${board.name} cannot be archived yet. ${blocked.join(' ')}` }
      }
      if (isCheckOnly(formData)) return CHECK_PASSED
      const archived = await archiveBoard(db, actor, parsed.value, signal)
      if (archived.ok) return { ok: true, message: `${board.name} archived.` }
      if (archived.error === 'forbidden') return { ok: false, error: FORBIDDEN }
      if (typeof archived.error === 'object') {
        return {
          ok: false,
          error: `${board.name} cannot be archived yet. ${archived.error.blocked.join(' ')}`,
        }
      }
      return { ok: false, error: GONE }
    },
    { answersCheck: true },
  )
}

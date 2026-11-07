import { BOARD_KINDS } from '@packs/nh/boardKinds'
import { z } from 'zod'
import { choice, recordId, requiredText } from '@/features/input/schemas'

const NAME_MAX = 120

export const ADD_BOARD_FORM = z.object({
  name: requiredText('the board name', { max: NAME_MAX }),
  shortName: requiredText('the short name', { max: NAME_MAX }),
  kind: choice('a kind of board', BOARD_KINDS),
})

export const RENAME_BOARD_FORM = z.object({
  boardId: recordId('a board'),
  name: requiredText('the board name', { max: NAME_MAX }),
  shortName: requiredText('the short name', { max: NAME_MAX }),
})

export const ARCHIVE_BOARD_FORM = z.object({ boardId: recordId('a board') })

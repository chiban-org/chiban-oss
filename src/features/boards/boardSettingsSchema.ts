import type { BoardKind } from '@packs/nh/schema'
import { civilDateSchema } from '@packs/nh/schema'
import { z } from 'zod'

const AdoptionSchema = z.object({
  adoptingAuthority: z.string(),
  adoptedOn: civilDateSchema.nullable(),
})

export const RECHECK_CONTACTS_DEFAULT_DAYS = 365

export const BoardSettingsBodySchema = z.object({
  key: z.literal('default'),
  boards: z.array(
    z.object({
      boardId: z.uuid(),
      publicNotice: z.object({
        posting: z.boolean(),
        publication: z.boolean(),
        newspaper: z.string().min(1).nullable(),
        bulletinBoards: z.array(z.string().min(1)),
        websiteUrl: z.string().url().nullable(),
      }),
      filingLeadDays: z.number().int().positive().nullable(),
      filingLeadAdoption: AdoptionSchema.nullable(),
    }),
  ),
  abutters: z.object({
    projectionEnabled: z.boolean(),
    layersConfirmedBy: z.string().min(1).nullable(),
    layersConfirmedOn: civilDateSchema.nullable(),
    assumedRightOfWayFt: z.number().positive(),
    recheckContactsDays: z.number().int().min(1).max(3650).optional(),
  }),
})
export type BoardSettingsBody = z.infer<typeof BoardSettingsBodySchema>

export type BoardSettingsEntry = BoardSettingsBody['boards'][number]

const ABUTTERS_DEFAULT: BoardSettingsBody['abutters'] = {
  projectionEnabled: false,
  layersConfirmedBy: null,
  layersConfirmedOn: null,
  assumedRightOfWayFt: 50,
  recheckContactsDays: RECHECK_CONTACTS_DEFAULT_DAYS,
}

export const BOARD_SETTINGS_DEFAULT: BoardSettingsBody = {
  key: 'default',
  boards: [],
  abutters: ABUTTERS_DEFAULT,
}

function defaultNotice(kind: BoardKind): BoardSettingsEntry['publicNotice'] {
  return {
    posting: true,
    publication: kind === 'zba',
    newspaper: null,
    bulletinBoards: [],
    websiteUrl: null,
  }
}

export function defaultBoardEntry(board: { id: string; kind: BoardKind }): BoardSettingsEntry {
  return {
    boardId: board.id,
    publicNotice: defaultNotice(board.kind),
    filingLeadDays: null,
    filingLeadAdoption: null,
  }
}

export function boardSettingsDefault(
  boards: readonly { id: string; kind: BoardKind }[],
): BoardSettingsBody {
  return { ...BOARD_SETTINGS_DEFAULT, boards: boards.map(defaultBoardEntry) }
}

export function reconcileBoardSettings(
  body: BoardSettingsBody,
  active: readonly { id: string; kind: BoardKind }[],
): BoardSettingsBody {
  const entries = new Map(body.boards.map((e) => [e.boardId, e]))
  return { ...body, boards: active.map((b) => entries.get(b.id) ?? defaultBoardEntry(b)) }
}

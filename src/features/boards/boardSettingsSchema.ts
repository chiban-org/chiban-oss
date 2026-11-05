import { BoardSchema, civilDateSchema } from '@packs/nh/schema'
import { z } from 'zod'

const AdoptionSchema = z.object({
  adoptingAuthority: z.string().min(1),
  adoptedOn: civilDateSchema,
})

export const RECHECK_CONTACTS_DEFAULT_DAYS = 365

export const BoardSettingsBodySchema = z.object({
  key: z.literal('default'),
  boards: z
    .array(
      z.object({
        board: BoardSchema,
        label: z.string().min(1),
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
    )
    .min(1),
  abutters: z.object({
    projectionEnabled: z.boolean(),
    layersConfirmedBy: z.string().min(1).nullable(),
    layersConfirmedOn: civilDateSchema.nullable(),
    assumedRightOfWayFt: z.number().positive(),
    recheckContactsDays: z.number().int().min(1).max(3650).optional(),
  }),
})
export type BoardSettingsBody = z.infer<typeof BoardSettingsBodySchema>

export const BOARD_SETTINGS_DEFAULT: BoardSettingsBody = {
  key: 'default',
  boards: [
    {
      board: 'planning_board',
      label: 'Alder Pond Planning Board',
      publicNotice: {
        posting: true,
        publication: false,
        newspaper: null,
        bulletinBoards: ['Alder Pond Town Hall bulletin board', 'Alder Pond Public Library'],
        websiteUrl: null,
      },
      filingLeadDays: null,
      filingLeadAdoption: null,
    },
    {
      board: 'zba',
      label: 'Alder Pond Zoning Board of Adjustment',
      publicNotice: {
        posting: true,
        publication: true,
        newspaper: 'Alder Pond Ledger',
        bulletinBoards: ['Alder Pond Town Hall bulletin board'],
        websiteUrl: null,
      },
      filingLeadDays: null,
      filingLeadAdoption: null,
    },
  ],
  abutters: {
    projectionEnabled: false,
    layersConfirmedBy: null,
    layersConfirmedOn: null,
    assumedRightOfWayFt: 50,
    recheckContactsDays: RECHECK_CONTACTS_DEFAULT_DAYS,
  },
}

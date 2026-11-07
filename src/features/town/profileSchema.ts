import { BOARD_KIND_TRAITS } from '@packs/nh/boardSchema'
import { z } from 'zod'

export const TOWN_ASSET_PREFIX = 'town-assets/'
export const TOWN_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const
export type TownImageType = (typeof TOWN_IMAGE_TYPES)[number]

export const TownImageSchema = z.object({
  objectKey: z.string().regex(/^town-assets\/[0-9a-f]{64}$/, 'Upload the image again.'),
  contentType: z.enum(TOWN_IMAGE_TYPES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type TownImage = z.infer<typeof TownImageSchema>

export const SIGNER_ROLES = [
  'building_official',
  'land_use_administrator',
  'planning_board_chair',
  'zba_chair',
  'code_enforcement_officer',
  'town_clerk',
] as const
export const SignerRoleSchema = z.enum(SIGNER_ROLES)
export type SignerRole = z.infer<typeof SignerRoleSchema>

export const SIGNER_ROLE_LABELS: Record<SignerRole, string> = {
  building_official: 'Building official',
  land_use_administrator: 'Land use administrator',
  planning_board_chair: `${BOARD_KIND_TRAITS.planning_board.label} chair`,
  zba_chair: `${BOARD_KIND_TRAITS.zba.label} chair`,
  code_enforcement_officer: 'Code enforcement officer',
  town_clerk: 'Town clerk',
}

const required = (message: string) => z.string().trim().min(1, message)

export const SignerSchema = z.object({
  role: SignerRoleSchema,
  name: required('Enter the name.'),
  title: required('Enter the title.'),
  signature: TownImageSchema.nullable(),
})
export type Signer = z.infer<typeof SignerSchema>

const AddressLinesSchema = z
  .array(required('Enter the address line or remove it.'))
  .min(1, 'Enter at least one address line.')
  .max(3, 'Use at most three address lines.')

export const BoardOverrideSchema = z.object({
  officeName: z.string().trim().optional(),
  addressLines: z.array(z.string().trim().min(1)).max(3).optional(),
  footerText: z.string().trim().optional(),
})
export type BoardOverride = z.infer<typeof BoardOverrideSchema>

export const CONTACT_LINES = ['address', 'phone', 'email', 'website', 'officeHours'] as const
export type ContactLine = (typeof CONTACT_LINES)[number]

export const LetterheadSchema = z.object({
  logoPosition: z.enum(['left', 'center']),
  contactLines: z.object({
    address: z.boolean(),
    phone: z.boolean(),
    email: z.boolean(),
    website: z.boolean(),
    officeHours: z.boolean(),
  }),
  footerText: z.string().trim(),
  pageNumbers: z.boolean(),
})
export type Letterhead = z.infer<typeof LetterheadSchema>

export const TownProfileBodySchema = z.object({
  key: z.literal('default'),
  officeName: required('Enter the office name.'),
  addressLines: AddressLinesSchema,
  phone: z.string().trim(),
  email: z.union([z.literal(''), z.email('Enter an email address like clerk@town.gov.')]),
  website: z.union([
    z.literal(''),
    z.url({ protocol: /^https?$/, message: 'Enter a web address starting with https://.' }),
  ]),
  officeHours: z.string().trim(),
  logo: TownImageSchema.nullable(),
  letterhead: LetterheadSchema,
  boardOverrides: z.record(z.uuid(), BoardOverrideSchema),
  signers: z.array(SignerSchema),
})
export type TownProfileBody = z.infer<typeof TownProfileBodySchema>

export const TOWN_PROFILE_SKELETON: TownProfileBody = {
  key: 'default',
  officeName: 'Land Use Office',
  addressLines: ['Town Hall'],
  phone: '',
  email: '',
  website: '',
  officeHours: '',
  logo: null,
  letterhead: {
    logoPosition: 'left',
    contactLines: { address: true, phone: true, email: true, website: false, officeHours: false },
    footerText: '',
    pageNumbers: true,
  },
  boardOverrides: {},
  signers: [],
}

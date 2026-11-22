import type { PackText } from '@/features/packs/packText'
import type { BoardKind } from '@/features/packs/schema/boards'
import { SIGNER_ROLES } from '@/features/town/profileSchema'

const BOARD_WORDS: Readonly<Record<BoardKind, string>> = {
  planning_board: 'Planning Board',
  zba: 'Zoning Appeals Board',
  historic_district_commission: 'Historic District Commission',
  building_code_board_of_appeals: 'Building Code Appeals Board',
  conservation_commission: 'Conservation Commission',
  heritage_commission: 'Heritage Commission',
  agricultural_commission: 'Agricultural Commission',
  housing_commission: 'Housing Commission',
  other: 'Other Board',
}

export const NEUTRAL_PACK_TEXT: PackText = {
  signerRoleLabels: {},
  signerRoles: SIGNER_ROLES,
  lockedTexts: {},
  environmentalAgency: 'State environmental agency',
  receiptNotices: false,
  significanceQuestion: false,
  vocabulary: {
    recordsLaw: 'Public Records',
    recordsRequest: 'Public Records request',
    governingBody: 'governing body',
    boardLabel: BOARD_WORDS,
    boardShort: BOARD_WORDS,
    boardAbbrev: BOARD_WORDS,
  },
}

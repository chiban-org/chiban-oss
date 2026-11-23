import type { BoardKind } from '@/features/packs/schema/boards'

export interface BoardKindBehaviour {
  decidesApplications: boolean
  holdsHearings: boolean
  hasFilingLead: boolean
  uniquePerTown: boolean
}

const ADVISORY: BoardKindBehaviour = {
  decidesApplications: false,
  holdsHearings: false,
  hasFilingLead: false,
  uniquePerTown: false,
}

export const BOARD_KIND_BEHAVIOUR: Readonly<Record<BoardKind, BoardKindBehaviour>> = {
  planning_board: {
    decidesApplications: true,
    holdsHearings: true,
    hasFilingLead: true,
    uniquePerTown: true,
  },
  zba: {
    decidesApplications: true,
    holdsHearings: true,
    hasFilingLead: false,
    uniquePerTown: true,
  },
  historic_district_commission: ADVISORY,
  building_code_board_of_appeals: ADVISORY,
  conservation_commission: ADVISORY,
  heritage_commission: ADVISORY,
  agricultural_commission: ADVISORY,
  housing_commission: ADVISORY,
  other: ADVISORY,
}

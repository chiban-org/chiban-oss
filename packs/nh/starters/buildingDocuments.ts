import {
  doc,
  IS_OWNER,
  NEAR_WATER,
  NEW_DWELLING,
  OWNER_AUTHORIZATION_LETTER,
  PLOT_PLAN,
  TOWN_SEWER,
  WETLANDS_WORK,
  when,
  yesBox,
} from '@packs/nh/starters/documentQuestions'
import type { DocumentItem } from '@/features/applications/documentItemSchema'
import type { FormField } from '@/features/forms/formSchema'

const BUILDING = { field: 'work_type', op: 'equals', value: 'building' } as const
const DEMOLITION = { field: 'work_type', op: 'equals', value: 'demolition' } as const

export const BUILDING_DOCUMENT_QUESTIONS: FormField[] = [
  IS_OWNER,
  TOWN_SEWER,
  yesBox('adds_bedrooms_or_footprint', 'The work adds bedrooms or changes the building footprint'),
  yesBox('new_conditioned_space', 'The work adds heated or cooled space'),
  NEAR_WATER,
  WETLANDS_WORK,
  yesBox('new_driveway', 'This is a new driveway or curb cut'),
  NEW_DWELLING,
  yesBox('prior_board_approvals', 'The project has Zoning Board or Planning Board approvals'),
]

export const BUILDING_DOCUMENTS: DocumentItem[] = [
  PLOT_PLAN,
  doc('construction_drawings', 'Construction drawings to scale', {
    help: 'Foundation, framing, and each floor.',
    requiredIf: BUILDING,
  }),
  doc('engineered_lumber', 'Truss or engineered lumber data, or an engineer’s stamp', {
    help: 'Needed when the design is not prescriptive. Staff will ask if it applies.',
    optional: true,
  }),
  doc('energy_code_form', 'Energy code compliance form', {
    requiredIf: { all: [BUILDING, when('new_conditioned_space')] },
  }),
  OWNER_AUTHORIZATION_LETTER,
  doc('septic_approval', 'State septic approval', {
    stage: 'before_issue',
    requiredIf: {
      all: [{ field: 'town_sewer', op: 'equals', value: 'no' }, when('adds_bedrooms_or_footprint')],
    },
  }),
  doc('shoreland_permit', 'Shoreland permit or exemption letter', {
    stage: 'before_issue',
    requiredIf: when('near_water'),
  }),
  doc('wetlands_permit', 'Wetlands permit or exemption letter', {
    stage: 'before_issue',
    requiredIf: when('wetlands_work'),
  }),
  doc('driveway_permit', 'Driveway permit and E-911 address', {
    stage: 'before_issue',
    requiredIf: { any: [when('new_driveway'), when('new_dwelling')] },
  }),
  doc('prior_board_approvals', 'Prior Zoning Board or Planning Board approvals', {
    stage: 'before_issue',
    requiredIf: when('prior_board_approvals'),
  }),
  doc('asbestos_notification', 'NHDES asbestos notification', {
    stage: 'before_issue',
    help: 'File it with NHDES at least 10 working days before demolition.',
    requiredIf: DEMOLITION,
  }),
  doc('utility_disconnects', 'Utility disconnect confirmations', {
    stage: 'before_issue',
    requiredIf: DEMOLITION,
  }),
  doc('disposal_destination', 'Where the demolition debris will go', {
    stage: 'before_issue',
    requiredIf: DEMOLITION,
  }),
]

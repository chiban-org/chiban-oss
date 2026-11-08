import {
  doc,
  NEAR_WATER,
  OWNER_AUTHORIZATION_LETTER,
  PLOT_PLAN,
  WETLANDS_WORK,
  when,
  yesBox,
} from '@packs/nh/starters/documentQuestions'
import type { DocumentItem } from '@/features/applications/documentItemSchema'
import type { FormField } from '@/features/forms/formSchema'

const PRIOR_ZBA = yesBox('prior_zba_decisions', 'The project relies on earlier ZBA decisions')

export const PLAN_FIELDS: FormField[] = [
  {
    key: 'sealed_professionals',
    label: 'Names and addresses of every professional whose seal is on the plan',
    type: 'textarea',
    required: false,
  },
  {
    key: 'easement_holders',
    label: 'Holders of conservation, preservation or agricultural easements on the land',
    type: 'textarea',
    required: false,
  },
  PRIOR_ZBA,
  WETLANDS_WORK,
  NEAR_WATER,
  yesBox('alteration_of_terrain', 'The project needs an NHDES Alteration of Terrain permit'),
  yesBox('state_road', 'The site has access on a state road'),
]

export const LOT_SIZE_FIELD = yesBox(
  'lot_under_5_acres',
  'Any proposed lot is smaller than 5 acres',
)

const PRIOR_ZBA_DECISIONS = doc('prior_zba_decisions', 'Prior ZBA decisions', {
  requiredIf: when('prior_zba_decisions'),
})

const PLAN_FILING: DocumentItem[] = [
  doc('plan', 'Plat or site plan'),
  OWNER_AUTHORIZATION_LETTER,
  doc('waiver_requests', 'Waiver requests', {
    help: 'If you ask the board to waive any regulation, upload the written request.',
    optional: true,
  }),
  PRIOR_ZBA_DECISIONS,
]

function statePermit(key: string, label: string, field: string): DocumentItem {
  return doc(key, label, {
    stage: 'before_decision',
    stateOrFederalPermit: true,
    requiredIf: when(field),
  })
}

const STATE_PERMITS: DocumentItem[] = [
  statePermit(
    'alteration_of_terrain_permit',
    'Alteration of Terrain permit',
    'alteration_of_terrain',
  ),
  statePermit('wetlands_permit', 'Wetlands permit', 'wetlands_work'),
  statePermit('shoreland_permit', 'Shoreland permit', 'near_water'),
  statePermit('nhdot_driveway_permit', 'NHDOT driveway permit', 'state_road'),
  doc('board_study', 'Traffic or drainage study', {
    stage: 'before_decision',
    help: 'Only when the board asks for one.',
    optional: true,
  }),
]

const SITE_PLAN_EXTRAS: DocumentItem[] = [
  doc('project_narrative', 'Project narrative'),
  doc('stormwater_plan', 'Stormwater and erosion control plan', { waivable: true }),
  doc('lighting_plan', 'Lighting plan', { waivable: true }),
  doc('landscaping_plan', 'Landscaping plan', { waivable: true }),
]

export const SITE_PLAN_DOCUMENTS: DocumentItem[] = [
  ...PLAN_FILING,
  ...SITE_PLAN_EXTRAS,
  ...STATE_PERMITS,
]

export const SUBDIVISION_DOCUMENTS: DocumentItem[] = [
  ...PLAN_FILING,
  statePermit('des_subdivision_approval', 'NHDES subdivision approval', 'lot_under_5_acres'),
  ...STATE_PERMITS,
]

export const LOT_LINE_DOCUMENTS: DocumentItem[] = [...PLAN_FILING, ...STATE_PERMITS]

export const NARRATIVE_AND_SKETCH: DocumentItem[] = [
  doc('project_narrative', 'Project narrative'),
  doc('site_sketch', 'Site sketch'),
]

const ZONING_LETTER = doc('zoning_letter', 'Zoning officer’s letter or decision', {
  help: 'The letter or decision that sent this application to the ZBA.',
})

export const ZBA_DOCUMENTS: DocumentItem[] = [PLOT_PLAN, OWNER_AUTHORIZATION_LETTER, ZONING_LETTER]

export const APPEAL_DOCUMENTS: DocumentItem[] = [
  PLOT_PLAN,
  OWNER_AUTHORIZATION_LETTER,
  doc('decision_appealed', 'Copy of the decision appealed'),
]

export const MORE_THAN_ONE_DWELLING_DOCUMENTS: DocumentItem[] = [
  OWNER_AUTHORIZATION_LETTER,
  PLOT_PLAN,
  doc('unit_density_calculation', 'Unit density calculation sheet', {
    help: 'List each lot with its soil type, slope, minimum lot size and the areas excluded, and the total allowable units.',
  }),
  doc('inspection_authority', 'Authority for inspection or examination of land', {
    help: 'Signed by each owner so board members and staff can visit the property.',
  }),
  doc('septic_design', 'State-approved, signed septic design', {
    stage: 'before_decision',
    stateOrFederalPermit: true,
  }),
]

export const TEN_YEAR_FIELD = yesBox(
  'ten_year_route',
  'The violation has existed for 10 years or more',
)

export const EQUITABLE_WAIVER_DOCUMENTS: DocumentItem[] = [
  ...ZBA_DOCUMENTS,
  doc('as_built_survey', 'As-built survey'),
  doc('permit_history', 'Permit history', {
    help: 'Permits and approvals on file for the structure.',
    optional: true,
  }),
  doc('proof_of_age', 'Proof of how long the violation has existed', {
    requiredIf: when('ten_year_route'),
  }),
]

export const REHEARING_DOCUMENTS: DocumentItem[] = [
  doc('rehearing_motion', 'Motion for rehearing', {
    help: 'State every ground you want the board to reconsider (RSA 677:3).',
  }),
]

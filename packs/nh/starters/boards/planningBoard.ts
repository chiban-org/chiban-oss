import {
  LOT_LINE_DOCUMENTS,
  LOT_SIZE_FIELD,
  NARRATIVE_AND_SKETCH,
  PLAN_FIELDS,
  SITE_PLAN_DOCUMENTS,
  SUBDIVISION_DOCUMENTS,
} from '@packs/nh/starters/boards/boardDocuments'
import { boardStarter, PLANNING_BOARD_WORKFLOW, perLot } from '@packs/nh/starters/boards/shared'

const FLOOR_AREA = {
  key: 'gross_floor_area_sq_ft',
  label: 'Gross floor area (square feet)',
  type: 'integer',
  required: true,
  validation: { min: 0 },
} as const

export const SITE_PLAN_STARTER = boardStarter({
  id: 'nh.starter.pb_site_plan',
  prefix: 'SPR',
  slug: 'spr',
  label: 'Site plan review (major)',
  classification: 'nh.pb_site_plan',
  fields: [
    FLOOR_AREA,
    {
      key: 'parking_spaces',
      label: 'Parking spaces',
      type: 'integer',
      required: true,
      validation: { min: 0 },
    },
    ...PLAN_FIELDS,
  ],
  applicationFee: { op: 'flat', cents: 25000 },
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: SITE_PLAN_DOCUMENTS,
})

export const MINOR_SITE_PLAN_STARTER = boardStarter({
  id: 'nh.starter.pb_minor_site_plan',
  prefix: 'MSP',
  slug: 'msp',
  label: 'Minor site plan',
  classification: 'nh.pb_site_plan',
  fields: [FLOOR_AREA, ...PLAN_FIELDS],
  applicationFee: { op: 'flat', cents: 10000 },
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: SITE_PLAN_DOCUMENTS,
})

export const SITE_PLAN_AMENDMENT_STARTER = boardStarter({
  id: 'nh.starter.pb_site_plan_amendment',
  prefix: 'SPA',
  slug: 'spa',
  label: 'Site plan amendment or change of use',
  classification: 'nh.pb_site_plan',
  fields: [
    {
      key: 'prior_approval_reference',
      label: 'Prior approval reference',
      type: 'text',
      required: true,
    },
    { key: 'proposed_use', label: 'Proposed use', type: 'text', required: true },
    ...PLAN_FIELDS,
  ],
  applicationFee: { op: 'flat', cents: 7500 },
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: SITE_PLAN_DOCUMENTS,
})

export const SUBDIVISION_STARTER = boardStarter({
  id: 'nh.starter.pb_subdivision',
  prefix: 'SUB',
  slug: 'sub',
  label: 'Subdivision (major)',
  classification: 'nh.pb_subdivision',
  fields: [
    {
      key: 'lot_count',
      label: 'Number of lots',
      type: 'integer',
      required: true,
      validation: { min: 4 },
    },
    ...PLAN_FIELDS,
    LOT_SIZE_FIELD,
  ],
  applicationFee: perLot(20000),
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: SUBDIVISION_DOCUMENTS,
})

export const MINOR_SUBDIVISION_STARTER = boardStarter({
  id: 'nh.starter.pb_minor_subdivision',
  prefix: 'MSUB',
  slug: 'msub',
  label: 'Minor subdivision',
  classification: 'nh.pb_subdivision',
  fields: [
    {
      key: 'lot_count',
      label: 'Number of lots',
      type: 'integer',
      required: true,
      validation: { min: 1, max: 3 },
    },
    ...PLAN_FIELDS,
    LOT_SIZE_FIELD,
  ],
  applicationFee: perLot(10000),
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: SUBDIVISION_DOCUMENTS,
})

export const LOT_LINE_ADJUSTMENT_STARTER = boardStarter({
  id: 'nh.starter.pb_lot_line_adjustment',
  prefix: 'LLA',
  slug: 'lla',
  label: 'Lot line adjustment',
  classification: 'nh.pb_subdivision',
  fields: [
    {
      key: 'area_transferred_sq_ft',
      label: 'Area transferred (square feet)',
      type: 'integer',
      required: true,
      validation: { min: 0 },
    },
    ...PLAN_FIELDS,
  ],
  applicationFee: { op: 'flat', cents: 7500 },
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: LOT_LINE_DOCUMENTS,
})

export const CONDITIONAL_USE_STARTER = boardStarter({
  id: 'nh.starter.pb_conditional_use',
  prefix: 'CUP',
  slug: 'cup',
  label: 'Conditional use permit',
  classification: 'nh.pb_conditional_use',
  fields: [{ key: 'ordinance_section', label: 'Ordinance section', type: 'text', required: true }],
  applicationFee: { op: 'flat', cents: 10000 },
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: NARRATIVE_AND_SKETCH,
})

export const DESIGN_REVIEW_STARTER = boardStarter({
  id: 'nh.starter.pb_design_review',
  prefix: 'DR',
  slug: 'dr',
  label: 'Design review',
  classification: 'nh.pb_design_review',
  fields: [
    {
      key: 'questions_for_board',
      label: 'Questions for the board',
      type: 'textarea',
      required: false,
    },
  ],
  applicationFee: { op: 'flat', cents: 5000 },
  newspaper: false,
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: NARRATIVE_AND_SKETCH,
})

export const PLANNING_BOARD_STARTERS = [
  SITE_PLAN_STARTER,
  MINOR_SITE_PLAN_STARTER,
  SITE_PLAN_AMENDMENT_STARTER,
  SUBDIVISION_STARTER,
  MINOR_SUBDIVISION_STARTER,
  LOT_LINE_ADJUSTMENT_STARTER,
  CONDITIONAL_USE_STARTER,
  DESIGN_REVIEW_STARTER,
]

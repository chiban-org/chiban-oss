import { boardStarter, PLANNING_BOARD_WORKFLOW } from '@packs/me/starters/boards/shared'
import { doc, SET_YOUR_FEE } from '@packs/me/starters/permitParts'

export const RECEIPT_TEXT =
  '{{town.name}}\n\nDated receipt for a subdivision application\n\nTo {{party.applicant.name}}:\n\nThe {{town.name}} Planning Board has received subdivision application {{application.number}}, {{project.title}}, for parcel {{parcel.displayId}}, {{parcel.siteAddress}}.\n\nDate received: ____\n\nThis dated receipt is given under 30-A MRSA §4403(3)(A). Under 30-A MRSA §4403(3)(B), the board will notify you in writing within 30 days of receiving the application whether it is complete or what additional material is needed.'

export const RECEIPT_NOTICE_TEXT =
  '{{town.name}}\n\nNotice of a subdivision application\n\nThe {{town.name}} Planning Board has received an application for subdivision approval. This notice is mailed under 30-A MRSA §4403(3)(A) to the owners of abutting property and to the clerk and the reviewing authority of each municipality that abuts or includes any portion of the subdivision.\n\nApplication: {{application.number}}, {{project.title}}\n\nApplicant: {{party.applicant.name}}\n\nLocation of the proposed subdivision: parcel {{parcel.displayId}}, {{parcel.siteAddress}}\n\nGeneral description of the project: ____\n\nThe application may be reviewed at the town office.'

export const SUBDIVISION_STARTER = boardStarter({
  id: 'me.starter.pb_subdivision',
  prefix: 'SUB',
  slug: 'sub',
  label: 'Subdivision',
  classification: 'me.pb_subdivision',
  fields: [
    {
      key: 'lot_count',
      label: 'Number of lots',
      type: 'integer',
      required: true,
      validation: { min: 1 },
    },
    {
      key: 'dwelling_unit_count',
      label: 'Number of dwelling units',
      type: 'integer',
      required: false,
      validation: { min: 0 },
    },
    {
      key: 'total_acreage',
      label: 'Total acreage',
      type: 'decimal',
      required: true,
    },
  ],
  noticeLine: {
    code: 'receipt_notice',
    label: `Receipt notice mailed to abutters (${SET_YOUR_FEE})`,
    due: 'at_notice',
    expr: {
      op: 'per_unit',
      source: { kind: 'count_of', what: 'abutters_on_issued_list' },
      centsPerUnit: 0,
    },
  },
  workflow: PLANNING_BOARD_WORKFLOW,
  documents: [
    doc('subdivision_plan', 'Subdivision plan'),
    doc('deed', 'Copy of the deed'),
    doc('state_permits', 'State or federal permits the project needs', {
      stage: 'before_decision',
      stateOrFederalPermit: true,
      optional: true,
    }),
  ],
  extraTemplates: [
    {
      key: 'sub-receipt',
      label: 'Subdivision dated receipt',
      kind: 'letter',
      body: RECEIPT_TEXT,
    },
    {
      key: 'sub-receipt-notice',
      label: 'Subdivision receipt notice',
      kind: 'letter',
      body: RECEIPT_NOTICE_TEXT,
    },
  ],
})

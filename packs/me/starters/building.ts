import {
  AFTER_THE_FACT,
  checklist,
  doc,
  IS_OWNER,
  OWNER_AUTHORIZATION,
  PLOT_PLAN,
  PUBLIC_SEWER,
  permitStarter,
  setYourFeeLine,
  when,
  yesBox,
} from '@packs/me/starters/permitParts'

const isResidential = {
  field: 'classification',
  op: 'equals',
  value: 'residential',
} as const

const INSPECTIONS = [
  ['footing', 'Footing inspection', ['Excavation depth and width', 'Reinforcement placed']],
  ['foundation', 'Foundation inspection', ['Walls and anchor bolts', 'Drainage and damp-proofing']],
  ['framing', 'Framing inspection', ['Structural framing', 'Fire blocking', 'Rough mechanical']],
  ['insulation', 'Insulation inspection', ['Insulation installed', 'Air sealing']],
  ['final', 'Final inspection', ['Work matches approved plans', 'Life-safety items complete']],
] as const

export const BUILDING_STARTER = permitStarter({
  id: 'me.starter.building',
  prefix: 'BP',
  slug: 'bp',
  label: 'Building permit',
  classification: 'me.building_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  fields: [
    {
      key: 'classification',
      label: 'Use classification',
      type: 'select',
      required: true,
      fact: 'classification',
      options: [
        { value: 'residential', label: 'Residential' },
        { value: 'nonresidential', label: 'Nonresidential' },
      ],
    },
    {
      key: 'dwelling_units',
      label: 'Number of dwelling units',
      type: 'integer',
      required: false,
      fact: 'dwellingUnits',
      validation: { min: 1 },
      showIf: isResidential,
      requireIf: isResidential,
    },
    {
      key: 'floor_area_sq_ft',
      label: 'Floor area of the work (sq ft)',
      type: 'decimal',
      required: false,
      validation: { min: 0, max: 10000000 },
    },
    {
      key: 'estimated_cost',
      label: 'Estimated cost of work',
      type: 'money',
      required: false,
    },
    IS_OWNER,
    PUBLIC_SEWER,
    yesBox('adds_bedrooms', 'The work adds bedrooms'),
    yesBox('in_shoreland_zone', 'The work is in the shoreland zone'),
    AFTER_THE_FACT,
  ],
  feeLines: [setYourFeeLine('building', 'Building permit fee', 'at_approval')],
  conditions: [
    {
      code: 'LAND_USE',
      text: 'Land use ordinance compliance confirmed in writing',
      blocksIssuance: true,
    },
    {
      code: 'EROSION',
      text: 'Erosion and sedimentation controls in place before excavation',
      blocksIssuance: false,
    },
  ],
  checklists: INSPECTIONS.map(([type, label, items]) =>
    checklist({
      slug: 'bp',
      inspectionType: type,
      label,
      items,
      final: type === 'final',
    }),
  ),
  documents: [
    PLOT_PLAN,
    doc('construction_drawings', 'Construction drawings to scale', {
      help: 'Foundation, framing, and each floor.',
    }),
    OWNER_AUTHORIZATION,
    doc('subsurface_wastewater_permit', 'Subsurface wastewater disposal permit', {
      stage: 'before_issue',
      help: 'Issued by the local plumbing inspector.',
      requiredIf: {
        all: [{ field: 'public_sewer', op: 'equals', value: 'no' }, when('adds_bedrooms')],
      },
    }),
    doc('shoreland_permit', 'Shoreland permit', {
      stage: 'before_issue',
      requiredIf: when('in_shoreland_zone'),
    }),
  ],
  substeps: [
    { state: 'under_review', key: 'plan_review', label: 'Plan review' },
    { state: 'under_review', key: 'zoning_review', label: 'Land use review' },
    { state: 'issued', key: 'inspections', label: 'Inspections' },
    {
      state: 'issued',
      key: 'co_pending',
      label: 'Certificate of occupancy pending',
    },
  ],
  closesOn: 'certificate_of_occupancy',
  permitDetails:
    'Project {{project.title}}. Issued {{application.issuedOn}}, work to begin by {{application.expiresOn}}. Building code: {{codeEdition.label}}.',
})

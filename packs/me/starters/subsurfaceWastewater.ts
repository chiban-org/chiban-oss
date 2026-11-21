import {
  AFTER_THE_FACT,
  checklist,
  countField,
  doc,
  lateDoubled,
  perCount,
  permitStarter,
} from '@packs/me/starters/permitParts'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'

const TABLE_4A = '10-144 CMR ch 241 Table 4A minimum'

interface Component {
  code: string
  field: string
  label: string
  countLabel: string
  cents: number
}

const COMPONENTS: readonly Component[] = [
  {
    code: 'non_engineered_system',
    field: 'non_engineered_systems',
    label: 'Complete non-engineered system',
    countLabel: 'Complete non-engineered systems',
    cents: 25000,
  },
  {
    code: 'engineered_system',
    field: 'engineered_systems',
    label: 'Complete engineered system',
    countLabel: 'Complete engineered systems',
    cents: 20000,
  },
  {
    code: 'primitive_system',
    field: 'primitive_systems',
    label: 'Primitive system, includes one alternative toilet',
    countLabel: 'Primitive systems, each including one alternative toilet',
    cents: 10000,
  },
  {
    code: 'grey_waste_field',
    field: 'grey_waste_fields',
    label: 'Separate grey waste disposal field',
    countLabel: 'Separate grey waste disposal fields',
    cents: 3500,
  },
  {
    code: 'alternative_toilet',
    field: 'alternative_toilets',
    label: 'Alternative toilet only',
    countLabel: 'Alternative toilets not part of a primitive system',
    cents: 5000,
  },
  {
    code: 'disposal_field_engineered',
    field: 'disposal_fields_engineered',
    label: 'Disposal field only, engineered system',
    countLabel: 'Disposal fields only, engineered system',
    cents: 15000,
  },
  {
    code: 'disposal_field_non_engineered',
    field: 'disposal_fields_non_engineered',
    label: 'Disposal field only, non-engineered',
    countLabel: 'Disposal fields only, non-engineered',
    cents: 15000,
  },
  {
    code: 'septic_tank_non_engineered',
    field: 'septic_tanks_non_engineered',
    label: 'Septic tank only, non-engineered',
    countLabel: 'Septic tanks only, non-engineered',
    cents: 15000,
  },
  {
    code: 'septic_tank_engineered',
    field: 'septic_tanks_engineered',
    label: 'Septic tank only, engineered',
    countLabel: 'Septic tanks only, engineered',
    cents: 8000,
  },
  {
    code: 'holding_tank',
    field: 'holding_tanks',
    label: 'Holding tank',
    countLabel: 'Holding tanks',
    cents: 10000,
  },
  {
    code: 'treatment_unit_tank',
    field: 'treatment_unit_tanks',
    label: 'Advanced treatment unit, tank',
    countLabel: 'Advanced treatment unit tanks',
    cents: 15000,
  },
  {
    code: 'treatment_unit_component',
    field: 'treatment_unit_components',
    label: 'Advanced treatment unit, component',
    countLabel: 'Advanced treatment unit components',
    cents: 3000,
  },
  {
    code: 'other_component',
    field: 'other_components',
    label: 'Other components: complete pump station, piping, other',
    countLabel: 'Other components (complete pump station, piping, other)',
    cents: 3000,
  },
  {
    code: 'first_time_variance',
    field: 'first_time_variances',
    label: 'First-time system variance',
    countLabel: 'First-time system variances',
    cents: 2000,
  },
]

const FEE_LINES: FeeScheduleBody['lines'] = COMPONENTS.map((c) => ({
  code: c.code,
  label: `${c.label} (${TABLE_4A})`,
  due: 'at_approval',
  expr: lateDoubled(perCount(c.field, c.cents)),
}))

export const SUBSURFACE_WASTEWATER_STARTER = permitStarter({
  id: 'me.starter.subsurface_wastewater',
  prefix: 'SSW',
  slug: 'ssw',
  label: 'Subsurface wastewater disposal permit',
  classification: 'me.subsurface_wastewater',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  fields: [
    {
      key: 'contractor_license_number',
      label: 'Maine plumbing license number of the person doing the work',
      type: 'text',
      required: false,
    },
    ...COMPONENTS.map((c) => countField(c.field, c.countLabel)),
    AFTER_THE_FACT,
  ],
  feeLines: FEE_LINES,
  conditions: [
    {
      code: 'DESIGN',
      text: 'Application and design approved by the local plumbing inspector',
      blocksIssuance: true,
    },
    {
      code: 'NOTICE',
      text: 'Notify the local plumbing inspector at least 24 hours before the system is ready for each inspection (10-144 CMR ch 241 §12.I.6)',
      blocksIssuance: false,
    },
    {
      code: 'BACKFILL',
      text: 'No part of the system is backfilled until it has been inspected and approved (10-144 CMR ch 241 §12.I.8)',
      blocksIssuance: false,
    },
  ],
  checklists: [
    checklist({
      slug: 'ssw',
      inspectionType: 'site_preparation',
      label: 'After site preparation (10-144 CMR ch 241 §12.I.5.a)',
      items: [
        'Vegetation cut and removed in the disposal field area',
        'Area under the disposal field and backfill extensions roughened',
        'Transitional horizon established',
        'Erosion and sedimentation control measures in place',
      ],
      final: false,
    }),
    checklist({
      slug: 'ssw',
      inspectionType: 'before_covering',
      label: 'Before the system is covered (10-144 CMR ch 241 §12.I.5.b)',
      items: [
        'Stone, pipes or proprietary devices, tanks, filter fabric, and fill beneath and beside the disposal area installed',
        'No backfill placed above the disposal system components',
        'Curtain drains, diversion ditches, berms and other measures on the design in place',
      ],
      final: true,
    }),
  ],
  documents: [
    doc('hhe_200_application', 'Subsurface wastewater disposal application (HHE-200)', {
      help: 'Prepared by a licensed site evaluator for a non-engineered system, or by a professional engineer or licensed site evaluator for an engineered system. Include the site evaluation report, except for a replacement septic tank or an alternative toilet other than a pit privy (10-144 CMR ch 241 §4.A.2).',
    }),
  ],
  closesOn: 'final_inspection_passed',
  permitDetails:
    'Licensee {{permit.contractorWithLicense}}. Issued {{application.issuedOn}}, work to begin by {{application.expiresOn}}.',
})

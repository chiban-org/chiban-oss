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

const COMPONENTS = [
  ['non_engineered_system', 'non_engineered_systems', 'Complete non-engineered system', 25000],
  ['engineered_system', 'engineered_systems', 'Complete engineered system', 20000],
  ['primitive_system', 'primitive_systems', 'Primitive system', 10000],
  ['grey_waste_field', 'grey_waste_fields', 'Separate grey waste disposal field', 3500],
  ['alternative_toilet', 'alternative_toilets', 'Alternative toilet', 5000],
  ['holding_tank', 'holding_tanks', 'Holding tank', 10000],
  ['first_time_variance', 'first_time_variances', 'First-time system variance', 2000],
] as const

const FEE_LINES: FeeScheduleBody['lines'] = COMPONENTS.map(([code, field, label, cents]) => ({
  code,
  label: `${label} (${TABLE_4A})`,
  due: 'at_approval',
  expr: lateDoubled(perCount(field, cents)),
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
      label: 'Installer license number, when a licensed installer does the work',
      type: 'text',
      required: false,
    },
    ...COMPONENTS.map(([, field, label]) => countField(field, `${label}s`)),
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
    'Installer {{permit.contractorWithLicense}}. Issued {{application.issuedOn}}, work to begin by {{application.expiresOn}}.',
})

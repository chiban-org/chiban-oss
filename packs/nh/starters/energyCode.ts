import { doc, IS_OWNER, NOT_OWNER, yesBox } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

const SECOND_PATHS = ['ua_tradeoff', 'performance']

export const ENERGY_CODE_STARTER = localPermitStarter({
  id: 'nh.starter.energy_code',
  prefix: 'EC',
  slug: 'ec',
  label: 'Residential energy code certificate',
  classification: 'nh.local_permit_other',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  feeCents: 0,
  conditionText: 'Certificate matches the building permit plans',
  closesOn: 'issuance',
  version: 1,
  documents: [
    doc('ec1_form', 'Completed EC-1 certificate of compliance', {
      help: 'The state energy code certificate. The state building code adopts the IECC (RSA 155-A:1).',
    }),
    doc('energy_compliance_report', 'REScheck or performance report', {
      requiredIf: { field: 'compliance_path', op: 'in', value: SECOND_PATHS },
    }),
    doc('owner_authorization', 'Owner authorization', { requiredIf: NOT_OWNER }),
  ],
  fields: [
    {
      key: 'building_permit_number',
      label: 'Building permit number',
      type: 'text',
      required: false,
      help: 'The building permit this certificate belongs with, such as BP-2027-0001.',
    },
    {
      key: 'work_kind',
      label: 'What the certificate covers',
      type: 'select',
      required: true,
      options: [
        { value: 'new_home', label: 'A new home' },
        { value: 'addition', label: 'An addition' },
      ],
    },
    {
      key: 'compliance_path',
      label: 'How the work meets the energy code',
      type: 'select',
      required: true,
      options: [
        { value: 'prescriptive', label: 'Prescriptive path' },
        { value: 'ua_tradeoff', label: 'UA trade-off' },
        { value: 'performance', label: 'Performance path' },
      ],
    },
    {
      key: 'wall_r_value',
      label: 'Wall insulation R-value',
      type: 'decimal',
      required: false,
      validation: { min: 0 },
    },
    {
      key: 'ceiling_r_value',
      label: 'Ceiling or attic insulation R-value',
      type: 'decimal',
      required: false,
      validation: { min: 0 },
    },
    {
      key: 'window_u_factor',
      label: 'Window U-factor',
      type: 'decimal',
      required: false,
      validation: { min: 0 },
    },
    yesBox('air_sealing_test', 'A blower door air sealing test is planned'),
    yesBox('duct_testing', 'A duct leakage test is planned'),
    IS_OWNER,
  ],
})

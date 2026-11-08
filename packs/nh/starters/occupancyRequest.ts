import {
  doc,
  NEW_DWELLING,
  SEPTIC_SYSTEM,
  when,
  yesBox,
} from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const OCCUPANCY_REQUEST_STARTER = localPermitStarter({
  id: 'nh.starter.occupancy_request',
  prefix: 'CO',
  slug: 'co',
  label: 'Certificate of occupancy request',
  classification: 'nh.local_zoning_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  feeCents: 5000,
  conditionText: 'Occupancy walkthrough completed',
  closesOn: 'issuance',
  version: 2,
  documents: [
    doc('septic_operation_approval', 'State septic approval to operate', {
      stage: 'before_issue',
      requiredIf: when('septic_system'),
    }),
    doc('water_test', 'Potable water test results', {
      stage: 'before_issue',
      requiredIf: when('private_well'),
    }),
    doc('e911_address', 'E-911 address assignment', { stage: 'before_issue' }),
    doc('blower_door_test', 'Blower door test result', {
      stage: 'before_issue',
      requiredIf: when('new_dwelling'),
    }),
  ],
  fields: [
    {
      key: 'mode',
      label: 'Request type',
      type: 'select',
      required: true,
      options: [
        { value: 'existing_structure', label: 'Existing structure' },
        { value: 'change_of_use', label: 'Change of use' },
      ],
    },
    { key: 'intended_use', label: 'Intended use', type: 'text', required: true },
    SEPTIC_SYSTEM,
    yesBox('private_well', 'The building uses a private well'),
    NEW_DWELLING,
  ],
  checklist: {
    key: 'occupancy_walkthrough',
    inspectionType: 'final',
    label: 'Occupancy walkthrough',
    final: true,
    items: [{ key: 'walk-1', label: 'Life-safety items verified', required: true }],
  },
})

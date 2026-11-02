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
  ],
  checklist: {
    key: 'occupancy_walkthrough',
    inspectionType: 'final',
    label: 'Occupancy walkthrough',
    final: true,
    items: [{ key: 'walk-1', label: 'Life-safety items verified', required: true }],
  },
})

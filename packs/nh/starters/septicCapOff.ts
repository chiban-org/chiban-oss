import { doc } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const SEPTIC_CAP_OFF_STARTER = localPermitStarter({
  id: 'nh.starter.septic_cap_off',
  prefix: 'SC',
  slug: 'sc',
  label: 'Septic or sewer cap-off permit',
  classification: 'nh.trade_permit',
  payTiming: 'at_intake',
  allowsDirectIssue: true,
  feeCents: 4500,
  doublesAfterTheFact: true,
  conditionText: 'Licensed plumber of record confirmed',
  closesOn: 'final_inspection_passed',
  version: 2,
  documents: [
    doc('utility_disconnect', 'Utility disconnect confirmation', {
      help: 'A letter or email from the utility confirming the service is disconnected.',
      optional: true,
    }),
  ],
  fields: [
    {
      key: 'contractor_license_number',
      label: 'Contractor license number',
      type: 'text',
      required: true,
    },
    {
      key: 'system_type',
      label: 'System being capped off',
      type: 'select',
      required: true,
      options: [
        { value: 'septic', label: 'Septic' },
        { value: 'sewer', label: 'Sewer' },
      ],
    },
  ],
  checklist: {
    key: 'cap_off_final',
    inspectionType: 'final',
    label: 'Cap-off final inspection',
    final: true,
    items: [{ key: 'final-1', label: 'Line capped and inspected before backfill', required: true }],
  },
})

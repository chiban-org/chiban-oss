import { doc, IS_OWNER, NOT_OWNER } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const TEMPORARY_USE_STARTER = localPermitStarter({
  id: 'nh.starter.temporary_use',
  prefix: 'TUP',
  slug: 'tup',
  label: 'Temporary use permit',
  classification: 'nh.local_zoning_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  feeCents: 2500,
  conditionText: 'Dates, hours and setup confirmed on site',
  closesOn: 'issuance',
  version: 1,
  documents: [
    doc('tup_setup_sketch', 'Sketch of the setup', {
      help: 'Show the lot, the area used, parking, and any tents, stands or restrooms.',
    }),
    doc('property_owner_consent', 'Property owner consent', {
      help: 'A signed letter from the owner of the lot.',
      requiredIf: NOT_OWNER,
    }),
  ],
  fields: [
    { key: 'use_description', label: 'The temporary use', type: 'text', required: true },
    { key: 'start_date', label: 'First day', type: 'date', required: true },
    { key: 'end_date', label: 'Last day', type: 'date', required: true },
    { key: 'hours', label: 'Hours each day', type: 'text', required: true },
    { key: 'lot_location', label: 'Where on the lot', type: 'text', required: true },
    {
      key: 'expected_attendance',
      label: 'Expected attendance at one time',
      type: 'integer',
      required: true,
      validation: { min: 1 },
    },
    { key: 'parking', label: 'Parking arrangements', type: 'textarea', required: true },
    { key: 'sanitation', label: 'Sanitation arrangements', type: 'textarea', required: true },
    IS_OWNER,
  ],
})

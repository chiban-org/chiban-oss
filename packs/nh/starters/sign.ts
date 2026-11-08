import { doc, IS_OWNER, NOT_OWNER } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const SIGN_STARTER = localPermitStarter({
  id: 'nh.starter.sign',
  prefix: 'SG',
  slug: 'sg',
  label: 'Sign permit',
  classification: 'nh.local_zoning_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  feeCents: 2500,
  conditionText: 'Sign size and setback meet the zoning ordinance',
  closesOn: 'issuance',
  version: 2,
  documents: [
    doc('sign_drawing', 'Scaled drawing of the sign'),
    doc('sign_site_sketch', 'Site sketch with setbacks'),
    doc('landowner_permission', 'Landowner permission', { requiredIf: NOT_OWNER }),
  ],
  fields: [
    { key: 'sign_area_sq_ft', label: 'Sign area (sq ft)', type: 'decimal', required: true },
    { key: 'illuminated', label: 'Illuminated', type: 'checkbox', required: false },
    IS_OWNER,
  ],
})

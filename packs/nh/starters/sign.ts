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
  fields: [
    { key: 'sign_area_sq_ft', label: 'Sign area (sq ft)', type: 'decimal', required: true },
    { key: 'illuminated', label: 'Illuminated', type: 'checkbox', required: false },
  ],
})

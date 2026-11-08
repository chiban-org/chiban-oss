import { doc } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const HOME_OCCUPATION_STARTER = localPermitStarter({
  id: 'nh.starter.home_occupation',
  prefix: 'HO',
  slug: 'ho',
  label: 'Home occupation permit',
  classification: 'nh.local_zoning_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  feeCents: 7500,
  conditionText: 'Home occupation conditions of the zoning ordinance accepted',
  closesOn: 'issuance',
  version: 2,
  documents: [
    doc('occupation_floor_plan', 'Floor plan of the area used for the business'),
    doc('parking_sketch', 'Parking sketch'),
  ],
  fields: [
    { key: 'business_name', label: 'Business name', type: 'text', required: true },
    {
      key: 'employees',
      label: 'Employees who do not live at the property',
      type: 'integer',
      required: false,
      validation: { min: 0 },
    },
  ],
})

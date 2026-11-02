import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const STREET_ADDRESS_STARTER = localPermitStarter({
  id: 'nh.starter.street_address',
  prefix: 'SA',
  slug: 'sa',
  label: 'Street address assignment',
  classification: 'nh.local_permit_other',
  payTiming: 'at_intake',
  allowsDirectIssue: true,
  feeCents: 0,
  conditionText: 'Private road name and access confirmed',
  closesOn: 'issuance',
  fields: [
    { key: 'private_road', label: 'Private road name', type: 'text', required: true },
    {
      key: 'access_description',
      label: 'Where the driveway meets the road',
      type: 'textarea',
      required: false,
    },
  ],
})

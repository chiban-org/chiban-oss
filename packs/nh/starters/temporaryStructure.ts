import { localPermitStarter, TEMPORARY_BINDINGS } from '@packs/nh/starters/localPermit'

export const TEMPORARY_STRUCTURE_STARTER = localPermitStarter({
  id: 'nh.starter.temporary_structure',
  prefix: 'TS',
  slug: 'ts',
  label: 'Temporary structure permit',
  classification: 'nh.local_zoning_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  feeCents: 3000,
  conditionText: 'Removal date acknowledged',
  closesOn: 'expiration',
  extraBindings: TEMPORARY_BINDINGS,
  validityPhrase: 'Issued {{application.issuedOn}}, remove by {{application.expiresOn}}.',
  fields: [
    { key: 'structure_kind', label: 'Kind of structure', type: 'text', required: true },
    { key: 'footprint_sq_ft', label: 'Footprint (sq ft)', type: 'decimal', required: false },
  ],
})

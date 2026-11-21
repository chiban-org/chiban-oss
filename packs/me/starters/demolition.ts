import {
  doc,
  IS_OWNER,
  OWNER_AUTHORIZATION,
  permitStarter,
  setYourFeeLine,
} from '@packs/me/starters/permitParts'

export const DEMOLITION_STARTER = permitStarter({
  id: 'me.starter.demolition',
  prefix: 'DEM',
  slug: 'dem',
  label: 'Demolition permit',
  classification: 'me.demolition_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  fields: [
    {
      key: 'structure',
      label: 'Structure to be removed',
      type: 'text',
      required: true,
    },
    IS_OWNER,
  ],
  feeLines: [setYourFeeLine('demolition', 'Demolition permit fee', 'at_approval')],
  conditions: [
    {
      code: 'UTILITIES',
      text: 'Utility disconnections confirmed before demolition',
      blocksIssuance: true,
    },
  ],
  documents: [
    doc('demolition_site_sketch', 'Site sketch showing the structure to be removed'),
    OWNER_AUTHORIZATION,
    doc('utility_disconnects', 'Utility disconnect confirmations', {
      stage: 'before_issue',
    }),
    doc('disposal_destination', 'Where the demolition debris will go', {
      stage: 'before_issue',
    }),
  ],
  closesOn: 'expiration',
  permitDetails: 'Issued {{application.issuedOn}}, expires {{application.expiresOn}}.',
})
